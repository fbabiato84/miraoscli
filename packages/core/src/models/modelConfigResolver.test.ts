/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  resolveModelConfig,
  validateModelConfig,
  type ModelConfigResolutionResult,
  type ModelConfigSourcesInput,
} from './modelConfigResolver.js';
import type { ModelGenerationConfig } from './types.js';
import { AuthType } from '../core/contentGenerator.js';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import { MAINLINE_CODER_MODEL } from '../config/models.js';

const TIMEOUT_ENV = 'QWEN_CODE_API_TIMEOUT_MS';
// Every original input spells out cli/settings/env; they default to {} here.
const resolve = (input: Partial<ModelConfigSourcesInput> = {}) =>
  resolveModelConfig({
    authType: AuthType.USE_OPENAI,
    cli: {},
    settings: {},
    env: {},
    ...input,
  });
// OpenAI keyed by OPENAI_API_KEY with QWEN_CODE_API_TIMEOUT_MS=`value`, over
// settings.generationConfig.timeout when `settingsTimeout` is given.
const withEnvTimeout = (value: string, settingsTimeout?: number) =>
  resolve({
    settings: {
      apiKey: 'key',
      ...(settingsTimeout !== undefined && {
        generationConfig: { timeout: settingsTimeout },
      }),
    },
    env: { OPENAI_API_KEY: 'key', QWEN_CODE_API_TIMEOUT_MS: value },
  });
// OpenAI modelProvider whose key comes from env MY_KEY.
const provider = (generationConfig: ModelGenerationConfig) => ({
  id: 'model',
  name: 'Model',
  envKey: 'MY_KEY',
  baseUrl: 'https://api.example.com',
  generationConfig,
});
const PROVIDER_ENV = { MY_KEY: 'key', QWEN_CODE_API_TIMEOUT_MS: '900000' };
// Model supplied only via OPENAI_MODEL (no modelProviders entry).
const envOnly = (
  model: string,
  generationConfig?: Partial<ContentGeneratorConfig>,
) =>
  resolve({
    settings: generationConfig ? { generationConfig } : {},
    env: {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'http://localhost:8000/v1',
      OPENAI_MODEL: model,
    },
  });
// Asserts each value on result.config and that every one came from `kind`.
const expectFrom = (
  result: ModelConfigResolutionResult,
  kind: string,
  values: { model?: string; apiKey?: string; baseUrl?: string },
) => {
  for (const [key, value] of Object.entries(values)) {
    expect(result.config[key as keyof typeof values]).toBe(value);
    expect(result.sources[key].kind).toBe(kind);
  }
};
// Asserts the timeout, plus its source kind / envKey when given.
const expectTimeout = (
  result: ModelConfigResolutionResult,
  timeout: number | undefined,
  kind?: string,
  envKey?: string,
) => {
  expect(result.config.timeout).toBe(timeout);
  if (kind) expect(result.sources['timeout'].kind).toBe(kind);
  if (envKey) expect(result.sources['timeout'].envKey).toBe(envKey);
};

describe('modelConfigResolver', () => {
  describe('resolveModelConfig', () => {
    describe('OpenAI auth type', () => {
      it('resolves from CLI with highest priority', () => {
        const result = resolve({
          cli: {
            model: 'cli-model',
            apiKey: 'cli-key',
            baseUrl: 'https://cli.example.com',
          },
          settings: {
            model: 'settings-model',
            apiKey: 'settings-key',
            baseUrl: 'https://settings.example.com',
          },
          env: {
            OPENAI_MODEL: 'env-model',
            OPENAI_API_KEY: 'env-key',
            OPENAI_BASE_URL: 'https://env.example.com',
          },
        });

        expectFrom(result, 'cli', {
          model: 'cli-model',
          apiKey: 'cli-key',
          baseUrl: 'https://cli.example.com',
        });
      });

      it('falls back to env when CLI not provided', () => {
        const result = resolve({
          settings: { model: 'settings-model' },
          env: { OPENAI_MODEL: 'env-model', OPENAI_API_KEY: 'env-key' },
        });

        expectFrom(result, 'env', { model: 'env-model', apiKey: 'env-key' });
      });

      it('falls back to settings when env not provided', () => {
        const values = {
          model: 'settings-model',
          apiKey: 'settings-key',
          baseUrl: 'https://settings.example.com',
        };
        expectFrom(resolve({ settings: values }), 'settings', values);
      });

      it('uses default model when nothing provided', () => {
        // need key to be valid
        const result = resolve({ env: { OPENAI_API_KEY: 'some-key' } });

        expectFrom(result, 'default', { model: MAINLINE_CODER_MODEL });
      });

      it('prioritizes modelProvider over CLI', () => {
        const result = resolve({
          cli: { model: 'cli-model' },
          env: { MY_CUSTOM_KEY: 'provider-key' },
          modelProvider: {
            id: 'provider-model',
            name: 'Provider Model',
            envKey: 'MY_CUSTOM_KEY',
            baseUrl: 'https://provider.example.com',
            generationConfig: {},
          },
        });

        expect(result.config.model).toBe('provider-model');
        expect(result.config.apiKey).toBe('provider-key');
        expect(result.config.baseUrl).toBe('https://provider.example.com');

        expect(result.sources['model'].kind).toBe('modelProviders');
        expect(result.sources['apiKey'].kind).toBe('env');
        expect(result.sources['apiKey'].via?.kind).toBe('modelProviders');
      });

      it('reads QWEN_MODEL as fallback for OPENAI_MODEL', () => {
        const result = resolve({
          env: { QWEN_MODEL: 'qwen-model', OPENAI_API_KEY: 'key' },
        });

        expect(result.config.model).toBe('qwen-model');
        expect(result.sources['model'].envKey).toBe('QWEN_MODEL');
      });
    });

    describe('generation config resolution', () => {
      it('merges generation config from settings', () => {
        const result = resolve({
          settings: {
            apiKey: 'key',
            generationConfig: {
              timeout: 60000,
              streamIdleTimeoutMs: 300000,
              maxRetries: 5,
              samplingParams: {
                temperature: 0.7,
              },
            },
          },
        });

        expect(result.config.timeout).toBe(60000);
        expect(result.config.streamIdleTimeoutMs).toBe(300000);
        expect(result.config.maxRetries).toBe(5);
        expect(result.config.retryInitialDelayMs).toBeUndefined();
        expect(result.config.retryMaxDelayMs).toBeUndefined();
        expect(result.config.samplingParams?.temperature).toBe(0.7);

        expect(result.sources['timeout'].kind).toBe('settings');
        expect(result.sources['streamIdleTimeoutMs'].kind).toBe('settings');
        expect(result.sources['samplingParams'].kind).toBe('settings');
      });

      it('modelProvider config overrides settings', () => {
        const result = resolve({
          settings: {
            generationConfig: {
              timeout: 30000,
              streamIdleTimeoutMs: 300000,
              retryInitialDelayMs: 60_000,
              retryMaxDelayMs: 300_000,
            },
          },
          env: { MY_KEY: 'key' },
          modelProvider: provider({
            timeout: 60000,
            streamIdleTimeoutMs: 0,
            retryInitialDelayMs: 3_000,
            retryMaxDelayMs: 30_000,
          }),
        });

        expect(result.config.timeout).toBe(60000);
        expect(result.config.streamIdleTimeoutMs).toBe(0);
        expect(result.config.retryInitialDelayMs).toBe(3_000);
        expect(result.config.retryMaxDelayMs).toBe(30_000);
        for (const field of [
          'timeout',
          'streamIdleTimeoutMs',
          'retryInitialDelayMs',
          'retryMaxDelayMs',
        ]) {
          expect(result.sources[field].kind).toBe('modelProviders');
        }
      });

      it('resolves stream retry delay config from settings', () => {
        const result = resolve({
          settings: {
            apiKey: 'key',
            generationConfig: {
              maxRetries: 4,
              retryInitialDelayMs: 3000,
              retryMaxDelayMs: 30000,
            },
          },
        });

        expect(result.config.maxRetries).toBe(4);
        expect(result.config.retryInitialDelayMs).toBe(3000);
        expect(result.config.retryMaxDelayMs).toBe(30000);
        expect(result.sources['retryInitialDelayMs'].kind).toBe('settings');
        expect(result.sources['retryMaxDelayMs'].kind).toBe('settings');
      });

      // [title, env value, settings timeout, expected timeout, kind, envKey]
      it.each<[string, string, number | undefined, number, string, string?]>([
        [
          'QWEN_CODE_API_TIMEOUT_MS env var overrides settings timeout',
          '900000',
          30000,
          900000,
          'env',
          TIMEOUT_ENV,
        ],
        // Should fall back to settings value
        [
          'ignores invalid QWEN_CODE_API_TIMEOUT_MS values',
          'invalid',
          30000,
          30000,
          'settings',
        ],
        // 0 is a valid disable sentinel; env overrides settings.
        [
          'accepts zero QWEN_CODE_API_TIMEOUT_MS and overrides settings (disables timeout downstream)',
          '0',
          30000,
          0,
          'env',
          TIMEOUT_ENV,
        ],
        [
          'handles extremely large timeout values safely',
          '999999999',
          undefined,
          999999999,
          'env',
        ],
        [
          'handles whitespace-padded env values',
          ' 300000 ',
          undefined,
          300000,
          'env',
        ],
        [
          'ignores negative QWEN_CODE_API_TIMEOUT_MS values',
          '-100',
          30000,
          30000,
          'settings',
        ],
      ])('%s', (_title, value, settingsTimeout, timeout, kind, envKey) => {
        const result = withEnvTimeout(value, settingsTimeout);

        expectTimeout(result, timeout, kind, envKey);
      });

      it('modelProvider timeout wins over QWEN_CODE_API_TIMEOUT_MS', () => {
        const result = resolve({
          env: PROVIDER_ENV,
          modelProvider: provider({ timeout: 60000 }),
        });

        // modelProvider > env: modelProvider timeout should win
        expectTimeout(result, 60000, 'modelProviders');
      });

      it('QWEN_CODE_API_TIMEOUT_MS applies when modelProvider has no timeout', () => {
        const result = resolve({
          env: PROVIDER_ENV,
          modelProvider: provider({}),
        });

        expectTimeout(result, 900000, 'env', TIMEOUT_ENV);
      });

      it('timeout is undefined when not configured, default applied in buildClient', () => {
        const result = resolve({
          settings: { apiKey: 'key' },
          env: { OPENAI_API_KEY: 'key' },
        });

        // timeout is undefined here; DEFAULT_TIMEOUT (120000) is applied in
        // the provider's buildClient() when timeout is not set.
        expect(result.config.timeout).toBeUndefined();
      });

      it('env var actually changes resolved timeout value', () => {
        // Integration-style test: proves the env var flows through to the
        // resolved config (the env value, not the settings value).
        const result = withEnvTimeout('900000', 30000);

        expectTimeout(result, 900000, 'env', TIMEOUT_ENV);
        // Prove it would be used by the client (default.ts:48 reads config.timeout)
        const clientTimeout = result.config.timeout;
        expect(clientTimeout).toBe(900000);
      });
    });

    describe('proxy handling', () => {
      it('includes proxy in config when provided', () => {
        const result = resolve({
          settings: { apiKey: 'key' },
          proxy: 'http://proxy.example.com:8080',
        });

        expect(result.config.proxy).toBe('http://proxy.example.com:8080');
        expect(result.sources['proxy'].kind).toBe('computed');
      });
    });
  });

  describe('validateModelConfig', () => {
    it('passes for valid OpenAI config', () => {
      const result = validateModelConfig({
        authType: AuthType.USE_OPENAI,
        model: 'gpt-4',
        apiKey: 'sk-xxx',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when API key missing', () => {
      const result = validateModelConfig({
        authType: AuthType.USE_OPENAI,
        model: 'gpt-4',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Missing API key');
    });

    it('fails when model missing', () => {
      const result = validateModelConfig({
        authType: AuthType.USE_OPENAI,
        model: '',
        apiKey: 'sk-xxx',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Missing model');
    });

    it('uses strict error messages for modelProvider', () => {
      const result = validateModelConfig(
        {
          authType: AuthType.USE_OPENAI,
          model: 'my-model',
          // missing apiKey
        },
        true, // isStrictModelProvider
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('modelProviders');
      expect(result.errors[0].message).toContain('envKey');
    });
  });

  describe('[Regression] timeout env override refactor', () => {
    it('[Regression] non-OAuth path must apply QWEN_CODE_API_TIMEOUT_MS', () => {
      expectTimeout(withEnvTimeout('900000'), 900000, 'env', TIMEOUT_ENV);
    });

    it('[Regression] modelProvider timeout must win over env', () => {
      const nonOAuth = resolve({
        env: PROVIDER_ENV,
        modelProvider: provider({ timeout: 60000 }),
      });
      expectTimeout(nonOAuth, 60000, 'modelProviders');
    });

    it('[Regression] refactor must not alter precedence: env > settings', () => {
      // env must override settings
      expectTimeout(withEnvTimeout('900000', 30000), 900000, 'env');
    });
  });

  describe('[Additional] timeout env override edge cases', () => {
    it.each([
      ['ignores scientific notation in QWEN_CODE_API_TIMEOUT_MS', '1.5e5'],
      ['ignores hex values in QWEN_CODE_API_TIMEOUT_MS', '0x2BF20'],
      ['ignores fractional values in QWEN_CODE_API_TIMEOUT_MS', '12345.67'],
      [
        'ignores unsafe integers in QWEN_CODE_API_TIMEOUT_MS',
        String(Number.MAX_SAFE_INTEGER + 1),
      ],
      ['ignores empty string QWEN_CODE_API_TIMEOUT_MS', ''],
    ])('%s', (_title, value) => {
      expectTimeout(withEnvTimeout(value, 30000), 30000, 'settings');
    });

    it('applies env override for the OpenAI wire', () => {
      const result = resolve({
        authType: AuthType.USE_OPENAI,
        settings: { apiKey: 'key' },
        env: { OPENAI_API_KEY: 'key', QWEN_CODE_API_TIMEOUT_MS: '99999' },
      });

      expectTimeout(result, 99999, 'env');
    });
  });

  describe('enableRequestMetadata reaches the provider through configuration', () => {
    // The DashScope provider reads enableRequestMetadata off the resolved
    // ContentGeneratorConfig. If the field is missing from
    // MODEL_GENERATION_CONFIG_FIELDS the resolver drops it silently, so the
    // option is readable in the provider but unsettable by a user. These go
    // through resolveModelConfig rather than injecting the getter, which is
    // the path that was broken.
    const viaDashScope = (
      model: string,
      generationConfig?: Partial<ContentGeneratorConfig>,
    ) =>
      resolve({
        settings: {
          apiKey: 'key',
          ...(generationConfig && { generationConfig }),
        },
        env: {
          OPENAI_API_KEY: 'key',
          OPENAI_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          OPENAI_MODEL: model,
        },
      });

    it('carries a settings generationConfig value onto the resolved config', () => {
      const result = viaDashScope('ZHIPU/GLM-5.3-Flash', {
        enableRequestMetadata: true,
      });

      expect(result.config.enableRequestMetadata).toBe(true);
      expect(result.sources['enableRequestMetadata'].kind).toBe('settings');
    });

    it('carries an explicit false, so the option can suppress as well as restore', () => {
      const result = viaDashScope('qwen-max', { enableRequestMetadata: false });

      expect(result.config.enableRequestMetadata).toBe(false);
    });

    it('lets a modelProvider generationConfig win over settings, like every other field', () => {
      const result = resolve({
        settings: {
          generationConfig: { enableRequestMetadata: false },
        },
        modelProvider: provider({ enableRequestMetadata: true }),
        env: PROVIDER_ENV,
      });

      expect(result.config.enableRequestMetadata).toBe(true);
      expect(result.sources['enableRequestMetadata'].kind).toBe(
        'modelProviders',
      );
    });

    it('stays undefined when nothing sets it, preserving the model-family default', () => {
      const result = viaDashScope('qwen-max');

      expect(result.config.enableRequestMetadata).toBeUndefined();
    });
  });

  describe('[Regression] issue-4219 — env-var-only path must call defaultModalities()', () => {
    it('[Regression] env-var-only path: modalities auto-detected for qwen3.6-35b-a3b', () => {
      // REPRODUCES issue-4219: with the model supplied only via OPENAI_MODEL
      // (no modelProviders entry), resolveGenerationConfig() iterated
      // MODEL_GENERATION_CONFIG_FIELDS but never called defaultModalities(),
      // leaving config.modalities undefined, so image attachments were
      // silently dropped ("Unsupported <modality>") though the model supports
      // images. The modelRegistry path (resolveModelConfig in
      // modelRegistry.ts) and the modelsConfig path
      // (applyResolvedModelDefaults) both call defaultModalities() when
      // generationConfig.modalities is undefined.
      const result = envOnly('qwen3.6-35b-a3b');

      expect(result.config.model).toBe('qwen3.6-35b-a3b');

      // modalityDefaults.ts maps the qwen3.6-35b pattern to { image: true,
      // video: true }; the env-var-only path must auto-detect it just as the
      // modelProviders path does (modelsConfig.ts applyResolvedModelDefaults()
      // lines 791-797).
      expect(result.config.modalities).toBeDefined();
      expect(result.config.modalities?.image).toBe(true);
      expect(result.config.modalities?.video).toBe(true);
      expect(result.sources['modalities'].kind).toBe('computed');
    });

    it('env-var-only path: modalities defaults to {} for unknown model (text-only)', () => {
      // Locks the invariant: defaultModalities() returns {} (text-only) for
      // unknown model patterns, never undefined, so env-var-only setups never
      // re-expose `modalities === undefined` for downstream consumers to
      // misinterpret as "unresolved" (issue #4219).
      const result = envOnly('some-unknown-model-xyz');

      expect(result.config.modalities).toEqual({});
      expect(result.sources['modalities'].kind).toBe('computed');
    });

    it('env-var-only path: explicit settings.generationConfig.modalities is not overridden by fallback', () => {
      // Locks the `=== undefined` guard: explicitly configured modalities must
      // not be clobbered by defaultModalities(), even for a model whose name
      // would otherwise auto-resolve to multimodal ({ image: true, video: true }).
      const result = envOnly('qwen3.6-35b-a3b', {
        modalities: { image: false, pdf: false, video: false, audio: false },
      });

      expect(result.config.modalities?.image).toBe(false);
      expect(result.config.modalities?.video).toBe(false);
      expect(result.sources['modalities'].kind).toBe('settings');
    });
  });

  describe('[Regression] env-var-only path must apply model context defaults', () => {
    it('env-var-only path: contextWindowSize auto-detected for claude-opus-4-6', () => {
      const result = envOnly('claude-opus-4-6');

      expect(result.config.model).toBe('claude-opus-4-6');
      expect(result.config.contextWindowSize).toBe(1_000_000);
      expect(result.sources['contextWindowSize'].kind).toBe('computed');
    });

    it('env-var-only path: contextWindowSize auto-detected for a model whose limit differs from the global default', () => {
      // This suite runs with the catalog off (packages/core/test-setup.ts),
      // so 131,072 is the regex-table answer, not the shipped one — the
      // catalog-on twin of this exact env-only path pins the production value
      // (128,000) in model-catalog.test.ts ('uses the bundled gpt-4o limit on
      // the env-only configuration path'). gpt-4o resolves to 131,072 ≠
      // DEFAULT_TOKEN_LIMIT (200,000), so this assertion fails if the fallback
      // applies the generic default instead of the model-specific limit.
      const result = envOnly('gpt-4o');

      expect(result.config.model).toBe('gpt-4o');
      expect(result.config.contextWindowSize).toBe(131_072);
      expect(result.sources['contextWindowSize'].kind).toBe('computed');
    });

    it('env-var-only path: unknown model keeps contextWindowSize undefined', () => {
      // Unknown models must not be stamped with an explicit window and an
      // 'auto-detected' source — downstream `?? DEFAULT_TOKEN_LIMIT`
      // consumers apply the generic default instead.
      const result = envOnly('totally-unknown-model-xyz');

      expect(result.config.model).toBe('totally-unknown-model-xyz');
      expect(result.config.contextWindowSize).toBeUndefined();
      expect(result.sources['contextWindowSize']).toBeUndefined();
    });

    it('env-var-only path: explicit settings contextWindowSize is not overridden by fallback', () => {
      const result = envOnly('claude-opus-4-6', { contextWindowSize: 32_000 });

      expect(result.config.contextWindowSize).toBe(32_000);
      expect(result.sources['contextWindowSize'].kind).toBe('settings');
    });
  });
});
