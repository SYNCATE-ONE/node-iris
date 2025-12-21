/**
 * Base types, storage, and utilities for decorators
 */

import { ChatContext } from '@/types/models';
import { Logger } from '@/utils/logger';

export type DecoratorHandler = (context: ChatContext) => void | Promise<void>;

// Global debug logger for decorators
let globalDebugLogger: Logger | null = null;

export function setGlobalDebugLogger(logger: Logger) {
  globalDebugLogger = logger;
}

export function getGlobalDebugLogger(): Logger {
  if (!globalDebugLogger) {
    globalDebugLogger = new Logger('DecoratorMetadata', { logLevel: 'debug' });
  }
  return globalDebugLogger;
}

// Throttle storage for rate limiting
export const throttleStorage = new Map<string, Map<string, number[]>>();

// Command registry for bot commands
export const commandRegistry = new Map<string, any>();

// Controller registry for auto-registration
export const controllerRegistry = new Map<string, any[]>();

// Batch controller registry
export const batchControllerRegistry = new Map<string, any[]>();

// Bootstrap controller registry
export const bootstrapControllerRegistry = new Map<string, any[]>();

// Prefix storage for controllers and methods
export const controllerPrefixStorage = new Map<Function, string>();
export const methodPrefixStorage = new Map<Function, string>();

// Decorator metadata storage
export const decoratorMetadata = new Map<
  Function,
  {
    commands: string[];
    hasDecorators: boolean;
    isMessageHandler?: boolean;
    allowedRooms?: string[];
    roleValidator?:
      | string[]
      | ((context: ChatContext) => Promise<boolean> | boolean);
    roleLabel?: string;
  }
>();

/**
 * Helper function to register a controller for an event type
 */
export function registerController(eventType: string, constructor: any) {
  if (!controllerRegistry.has(eventType)) {
    controllerRegistry.set(eventType, []);
  }
  controllerRegistry.get(eventType)!.push(constructor);
}

/**
 * Helper function to register a batch controller
 */
export function registerBatchController(eventType: string, constructor: any) {
  if (!batchControllerRegistry.has(eventType)) {
    batchControllerRegistry.set(eventType, []);
  }
  batchControllerRegistry.get(eventType)!.push(constructor);
}

/**
 * Helper function to register a bootstrap controller
 */
export function registerBootstrapController(
  eventType: string,
  constructor: any
) {
  if (!bootstrapControllerRegistry.has(eventType)) {
    bootstrapControllerRegistry.set(eventType, []);
  }
  bootstrapControllerRegistry.get(eventType)!.push(constructor);
}

/**
 * Get all registered commands
 */
export function getRegisteredCommands(): Map<string, any> {
  return commandRegistry;
}

/**
 * Get all registered controllers
 */
export function getRegisteredControllers(): Map<string, any[]> {
  return controllerRegistry;
}

/**
 * Helper function to get batch controllers
 */
export function getBatchControllers(): Map<string, any[]> {
  return batchControllerRegistry;
}

/**
 * Helper function to get bootstrap controllers
 */
export function getBootstrapControllers(): Map<string, any[]> {
  return bootstrapControllerRegistry;
}

/**
 * Clear throttle data for a specific user (useful for admin commands)
 */
export function clearUserThrottle(userId: string): void {
  throttleStorage.forEach((methodMap) => {
    methodMap.delete(userId);
  });
}

/**
 * Clear all throttle data
 */
export function clearAllThrottle(): void {
  throttleStorage.clear();
}

/**
 * Get the prefix for a controller class
 */
export function getControllerPrefix(constructor: Function): string | undefined {
  return controllerPrefixStorage.get(constructor);
}

/**
 * Get the prefix for a method
 */
export function getMethodPrefix(method: Function): string | undefined {
  return methodPrefixStorage.get(method);
}

/**
 * Set controller prefix programmatically
 */
export function setControllerPrefix(
  constructor: Function,
  prefix: string
): void {
  controllerPrefixStorage.set(constructor, prefix);
}

/**
 * Set method prefix programmatically
 */
export function setMethodPrefix(method: Function, prefix: string): void {
  methodPrefixStorage.set(method, prefix);
}

/**
 * Clear all prefix data
 */
export function clearAllPrefixes(): void {
  controllerPrefixStorage.clear();
  methodPrefixStorage.clear();
}

/**
 * Debug function to inspect decorator metadata
 */
export function debugDecoratorMetadata(controllerInstance: any): void {
  const logger = getGlobalDebugLogger();
  const controllerName = controllerInstance.constructor.name;

  logger.debug(`=== Decorator Metadata for ${controllerName} ===`);

  // Check if controller has metadata
  const controllerMetadata = decoratorMetadata.get(
    controllerInstance.constructor
  );
  if (controllerMetadata) {
    logger.debug(`Controller metadata:`, controllerMetadata);
  }

  // Check methods
  const methods = Object.getOwnPropertyNames(
    Object.getPrototypeOf(controllerInstance)
  );
  methods.forEach((methodName) => {
    if (methodName !== 'constructor') {
      const method = controllerInstance[methodName];
      if (typeof method === 'function') {
        const methodMetadata = decoratorMetadata.get(method);
        if (methodMetadata) {
          logger.debug(`Method ${methodName} metadata:`, methodMetadata);
        }
      }
    }
  });

  logger.debug(`=== End Metadata for ${controllerName} ===`);
}
