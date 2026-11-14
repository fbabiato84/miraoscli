/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@qwen-code/qwen-code-core';
import type { AuthType } from '@qwen-code/qwen-code-core/utils/auth-type.js';
import { getErrorMessage } from '@qwen-code/qwen-code-core/utils/errors.js';
import { logAuth } from '@qwen-code/qwen-code-core/telemetry/loggers.js';
import { AuthEvent } from '@qwen-code/qwen-code-core/telemetry/types.js';

/**
 * Handles the initial authentication flow.
 * @param config The application config.
 * @param authType The selected auth type.
 * @returns An error message if authentication fails, otherwise null.
 */
export async function performInitialAuth(
  config: Config,
  authType: AuthType | undefined,
): Promise<string | null> {
  if (!authType) {
    return null;
  }

  try {
    await config.refreshAuth(authType, true);
    // The console.log is intentionally left out here.
    // We can add a dedicated startup message later if needed.

    // Log authentication success
    const authEvent = new AuthEvent(authType, 'auto', 'success');
    logAuth(config, authEvent);
  } catch (e) {
    const errorMessage = `Failed to login. Message: ${getErrorMessage(e)}`;

    // Log authentication failure
    const authEvent = new AuthEvent(authType, 'auto', 'error', errorMessage);
    logAuth(config, authEvent);

    return errorMessage;
  }

  return null;
}
