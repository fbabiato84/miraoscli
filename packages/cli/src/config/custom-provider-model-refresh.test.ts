/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthType, type Config } from '@qwen-code/qwen-code-core';
import { discoverProviderModels } from '@qwen-code/qwen-code-core/providers/model-discovery.js';
import { buildInstallPlan } from '@qwen-code/qwen-code-core/providers/provider-config.js';
import { applyProviderInstallPlan } from '@qwen-code/qwen-code-core/providers/install.js';
import {
  CUSTOM_API_KEY_ENV_PREFIX,
  customProvider,
  generateCustomEnvKey,
} from '@qwen-code/qwen-code-core/providers/presets/custom-provider.js';
import type { SettingScope, type LoadedSettings } from './settings.js';
import { addDiscoveredCustomProviderModels } from './custom-provider-model-refresh.js';

vi.mock('@qwen-code/qwen-code-core/providers/model-discovery.js', () => ({
  discoverProviderModels: vi.fn(),
}));

// The install machinery is covered by the core suite; what this module decides
// is which ids to install and that the plan leaves credential and selection
// untouched, so the plan is captured instead of applied.
vi.mock('@qwen-code/qwen-code-core/providers/install.js', () => ({
  applyProviderInstallPlan: vi.fn(async () => ({
    updatedModelProviders: {},
  })),
}));

const BASE_URL = 'http://127.0.0.1:11434/v1';
const OTHER_BASE_URL = 'http://127.0.0.1:8000/v1';
const ENV_KEY = generateCustomEnvKey(AuthType.USE_OPENAI, BASE_URL);
const ENV_KEY_OTHER = generateCustomEnvKey(AuthType.USE_OPENAI, OTHER_BASE_URL);

function setNested(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  const parts = key.split('.');
  let cursor: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (typeof next !== 'object' || next === null) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

function makeSettings(): LoadedSettings {
  const userFile = {
    settings: {} as Record<string, unknown>,
    originalSettings: {} as Record<string, unknown>,
    path: '/tmp/settings.json',
  };
  const settings: Record<string, unknown> = {
    merged: {
      modelProviders: {} as Record<string, unknown>,
      env: {} as Record<string, unknown>,
    },
    setValue: vi.fn((key: string, value: unknown) => {
      setNested(userFile.settings, key, value);
      setNested(userFile.originalSettings, key, value);
      // The merged view is what applyProviderInstallPlan validates against, so
      // a fixture that only writes the owning scope looks like a
      // higher-precedence override and the install is refused.
      setNested(settings['merged'] as Record<string, unknown>, key, value);
    }),
    setValues: vi.fn(
      (batch: Array<{ scope: SettingScope; key: string; value: unknown }>) => {
        for (const entry of batch) {
          setNested(userFile.settings, entry.key, entry.value);
          setNested(
            settings['merged'] as Record<string, unknown>,
            entry.key,
            entry.value,
          );
        }
      },
    ),
    forScope: vi.fn(() => userFile),
    recomputeMerged: vi.fn(),
    isTrusted: true,
    workspace: {
      settings: {},
      originalSettings: {},
      path: '/tmp/workspace-settings.json',
    },
    user: userFile,
    system: {
      settings: {},
      originalSettings: {},
      path: '/tmp/system-settings.json',
    },
    systemDefaults: {
      settings: {},
      originalSettings: {},
      path: '/tmp/system-defaults-settings.json',
    },
  };
  return settings as unknown as LoadedSettings;
}

/**
 * Seed `modelProviders` the way a previous install left it: hand-written
 * entries fail the post-write verification in applyProviderInstallPlan, which
 * compares the merged view against the plan byte for byte.
 */
function seedInstalled(
  target: LoadedSettings,
  ids: string[],
  baseUrl: string = BASE_URL,
): void {
  const plan = buildInstallPlan(customProvider, {
    baseUrl,
    apiKey: '',
    modelIds: ids,
    protocol: AuthType.USE_OPENAI,
  });
  target.merged['modelProviders'] = {
    [AuthType.USE_OPENAI]: plan.modelProviders![0]!.models,
  };
}

function makeConfig(
  baseUrl: string,
  apiKey: string,
): {
  config: Config;
  reload: ReturnType<typeof vi.fn>;
} {
  const reload = vi.fn();
  const config = {
    getModelsConfig: () => ({
      getCurrentAuthType: () => AuthType.USE_OPENAI,
      getGenerationConfig: () => ({ baseUrl, apiKey }),
    }),
    getCurrentModelRegistryBaseUrl: () => undefined,
    reloadModelProvidersConfig: reload,
  };
  return { config: config as unknown as Config, reload };
}

function installedIds(settings: LoadedSettings): string[] {
  const providers = settings.merged['modelProviders'] as Record<
    string,
    Array<{ id: string }>
  >;
  return (providers[AuthType.USE_OPENAI] ?? []).map((model) => model.id);
}

describe('addDiscoveredCustomProviderModels', () => {
  let settings: LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    settings = makeSettings();
    process.env[ENV_KEY] = 'sk-local';
    vi.mocked(discoverProviderModels).mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
    delete process.env[ENV_KEY_OTHER];
  });

  it('installs models the provider serves that are not installed yet', async () => {
    seedInstalled(settings, ['installed-a']);
    vi.mocked(discoverProviderModels).mockResolvedValue([
      { id: 'installed-a' },
      { id: 'served-b' },
    ]);

    const { config, reload } = makeConfig(BASE_URL, 'sk-local');
    const added = await addDiscoveredCustomProviderModels(settings, config);

    expect(added).toEqual(['served-b']);
    const plan = vi.mocked(applyProviderInstallPlan).mock.calls[0]![0];
    expect(plan.modelProviders![0]!.models.map((m) => m.id).sort()).toEqual([
      'installed-a',
      'served-b',
    ]);
    // A refresh must never rewrite the credential or move the selection.
    expect(plan.env).toBeUndefined();
    expect(plan.modelSelection).toBeUndefined();
    expect(vi.mocked(applyProviderInstallPlan).mock.calls[0]![1]).toMatchObject(
      { doRefreshAuth: false },
    );
    expect(reload).toBeInstanceOf(Function);
  });

  it('leaves the existing route intact for the model already in use', async () => {
    seedInstalled(settings, ['in-use']);
    vi.mocked(discoverProviderModels).mockResolvedValue([{ id: 'served-b' }]);

    const { config } = makeConfig(BASE_URL, 'in-use');
    await addDiscoveredCustomProviderModels(settings, config);

    const plan = vi.mocked(applyProviderInstallPlan).mock.calls[0]![0];
    const inUse = plan.modelProviders![0]!.models.find(
      (m) => m.id === 'in-use',
    );
    expect(inUse).toMatchObject({ id: 'in-use', baseUrl: BASE_URL });
  });

  it('changes nothing when every served model is already installed', async () => {
    seedInstalled(settings, ['installed-a', 'installed-b']);
    vi.mocked(discoverProviderModels).mockResolvedValue([
      { id: 'installed-a' },
      { id: 'installed-b' },
    ]);

    const { config, reload } = makeConfig(BASE_URL, 'sk-local');
    const added = await addDiscoveredCustomProviderModels(settings, config);

    expect(added).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
    expect(installedIds(settings).sort()).toEqual([
      'installed-a',
      'installed-b',
    ]);
  });

  it('does nothing when discovery answers nothing', async () => {
    seedInstalled(settings, ['installed-a']);
    vi.mocked(discoverProviderModels).mockResolvedValue(null);

    const { config, reload } = makeConfig(BASE_URL, 'sk-local');
    const added = await addDiscoveredCustomProviderModels(settings, config);

    expect(added).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('ignores another custom endpoint that is not the live route', async () => {
    seedInstalled(settings, ['other-model'], OTHER_BASE_URL);
    vi.mocked(discoverProviderModels).mockResolvedValue([{ id: 'served-x' }]);

    const { config } = makeConfig(BASE_URL, 'sk-local');
    const added = await addDiscoveredCustomProviderModels(settings, config);

    expect(added).toEqual([]);
    expect(discoverProviderModels).not.toHaveBeenCalled();
    expect(installedIds(settings)).toEqual(['other-model']);
  });

  it('never drops a model the listing omits', async () => {
    seedInstalled(settings, ['in-use', 'extra']);
    // The provider stops serving `extra`; an additive refresh keeps it.
    vi.mocked(discoverProviderModels).mockResolvedValue([{ id: 'in-use' }]);

    const { config } = makeConfig(BASE_URL, 'sk-local');
    const added = await addDiscoveredCustomProviderModels(settings, config);

    expect(added).toEqual([]);
    expect(installedIds(settings).sort()).toEqual(['extra', 'in-use']);
  });

  it('does not run when the route has no stored credential', async () => {
    seedInstalled(settings, ['installed-a']);
    delete process.env[ENV_KEY];

    const { config } = makeConfig(BASE_URL, '');
    const added = await addDiscoveredCustomProviderModels(settings, config);

    expect(added).toEqual([]);
    expect(discoverProviderModels).not.toHaveBeenCalled();
  });

  it('uses the credential the route resolved, not the generated env key alone', async () => {
    seedInstalled(settings, ['installed-a']);
    vi.mocked(discoverProviderModels).mockResolvedValue([{ id: 'served-b' }]);

    const { config } = makeConfig(BASE_URL, 'sk-resolved');
    await addDiscoveredCustomProviderModels(settings, config);

    expect(discoverProviderModels).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: BASE_URL, apiKey: 'sk-resolved' }),
    );
  });

  it('reports the custom env-key namespace the wizard installed', () => {
    expect(ENV_KEY.startsWith(CUSTOM_API_KEY_ENV_PREFIX)).toBe(true);
    expect(ENV_KEY).toBe(generateCustomEnvKey(AuthType.USE_OPENAI, BASE_URL));
    expect(ENV_KEY).not.toBe(ENV_KEY_OTHER);
  });
});
