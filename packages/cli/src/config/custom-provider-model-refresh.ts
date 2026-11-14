/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AuthType,
  createDebugLogger,
  type Config,
  type ModelProvidersConfig,
  type ProviderModelConfig,
} from '@qwen-code/qwen-code-core';
import { buildInstallPlan } from '@qwen-code/qwen-code-core/providers/provider-config.js';
import { tryResolveModelProtocol } from '@qwen-code/qwen-code-core/models/modelRegistry.js';
import {
  CUSTOM_API_KEY_ENV_PREFIX,
  customProvider,
} from '@qwen-code/qwen-code-core/providers/presets/custom-provider.js';
import { applyProviderInstallPlan } from '@qwen-code/qwen-code-core/providers/install.js';
import { discoverProviderModels } from '@qwen-code/qwen-code-core/providers/model-discovery.js';
import { SettingScope, type LoadedSettings } from './settings.js';
import { createLoadedSettingsAdapter } from './loadedSettingsAdapter.js';
import { getModelProvidersOwnerScope } from './modelProvidersScope.js';

const debugLogger = createDebugLogger('CUSTOM_MODELS');

interface ActiveCustomRoute {
  /** `settings.modelProviders` bucket the route lives in (openai, anthropic, …). */
  authType: AuthType;
  baseUrl: string;
  apiKey: string;
  /** Models already installed for this exact endpoint. */
  installed: ProviderModelConfig[];
}

function ownsCustomCredential(value: unknown): value is string {
  return (
    typeof value === 'string' && value.startsWith(CUSTOM_API_KEY_ENV_PREFIX)
  );
}

/**
 * Resolve the custom-provider route the session is actually talking to.
 *
 * Several custom endpoints can coexist in settings, and a rewrite of the wrong
 * bucket would change models the user never selected, so the live generation
 * config decides which entry is eligible — not the first one found.
 */
function resolveActiveCustomRoute(
  settings: LoadedSettings,
  config: Config,
): ActiveCustomRoute | undefined {
  const modelsConfig = config.getModelsConfig();
  const activeAuth = modelsConfig.getCurrentAuthType();
  if (!activeAuth) return undefined;

  const baseUrl = (
    modelsConfig.getGenerationConfig()?.baseUrl ??
    config.getCurrentModelRegistryBaseUrl?.() ??
    ''
  ).trim();
  if (!baseUrl) return undefined;

  const modelProviders = settings.merged.modelProviders as
    | ModelProvidersConfig
    | undefined;
  if (!modelProviders) return undefined;

  for (const [bucket, models] of Object.entries(modelProviders)) {
    if (!Array.isArray(models)) continue;
    const route = models.find(
      (model) =>
        model.baseUrl === baseUrl && ownsCustomCredential(model.envKey),
    );
    if (!route) continue;
    if (tryResolveModelProtocol(bucket as AuthType, route) !== activeAuth) {
      continue;
    }
    const installed = models.filter(
      (model) =>
        model.baseUrl === baseUrl && ownsCustomCredential(model.envKey),
    );
    const apiKey =
      modelsConfig.getGenerationConfig()?.apiKey?.trim() ||
      process.env[route.envKey!]?.trim() ||
      '';
    if (!apiKey) return undefined;
    return { authType: bucket as AuthType, baseUrl, apiKey, installed };
  }
  return undefined;
}

/**
 * Add models the provider serves but that are not installed yet.
 *
 * Additive by design: a listing that omits a model never removes it, so an
 * incomplete response cannot drop the model the session is running on. Returns
 * the ids that were installed, empty when there was nothing to add.
 */
export async function addDiscoveredCustomProviderModels(
  settings: LoadedSettings,
  config: Config,
): Promise<string[]> {
  const route = resolveActiveCustomRoute(settings, config);
  if (!route) return [];

  const discovered = await discoverProviderModels({
    baseUrl: route.baseUrl,
    apiKey: route.apiKey,
    staticModels: [],
  });
  if (!discovered?.length) return [];

  const installedIds = new Set(route.installed.map((model) => model.id));
  const added = discovered
    .map((model) => model.id)
    .filter((id) => !installedIds.has(id));
  if (added.length === 0) return [];

  const plan = buildInstallPlan(
    customProvider,
    {
      baseUrl: route.baseUrl,
      apiKey: '',
      modelIds: [...installedIds, ...added],
      protocol: route.authType,
    },
    route.installed,
  );
  // A catalog refresh must not touch the credential or move the selection.
  delete plan.env;
  delete plan.modelSelection;

  await applyProviderInstallPlan(plan, {
    settings: createLoadedSettingsAdapter(
      settings,
      getModelProvidersOwnerScope(settings) ?? SettingScope.User,
    ),
    reloadModelProviders: (modelProviders) =>
      config.reloadModelProvidersConfig(modelProviders),
    doRefreshAuth: false,
  });
  return added;
}

/**
 * Startup wrapper: never throws and never blocks the critical path, so an
 * unreachable endpoint or a settings write failure cannot break a session.
 */
export function refreshCustomProviderModelsInBackground(
  settings: LoadedSettings,
  config: Config,
): void {
  void addDiscoveredCustomProviderModels(settings, config)
    .then((added) => {
      if (added.length > 0) {
        debugLogger.debug(
          `installed ${added.length} model(s) served by the active provider`,
        );
      }
    })
    .catch((error) => {
      debugLogger.warn(
        `custom provider model refresh failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
}
