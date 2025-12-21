/**
 * Validation decorators for parameter, role, and permission checking
 */

import { ChatContext } from '@/types/models';
import type { DecoratorHandler } from './base';
import { decoratorMetadata, throttleStorage } from './base';

/**
 * Decorator that only executes if message has parameters
 */
export function HasParam(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (context: ChatContext) {
    if (!context.message.hasParam) {
      return;
    }

    return originalMethod.call(this, context);
  };

  return descriptor;
}

/**
 * Decorator that only executes if message is a reply
 */
export function IsReply(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (context: ChatContext) {
    if (!context.message.isReplyMessage()) {
      return;
    }

    return originalMethod.call(this, context);
  };

  return descriptor;
}

/**
 * Decorator that only executes if user has specific roles or passes custom validation
 * @param allowedRolesOrValidator - 허용된 역할 배열 또는 커스텀 검증 함수
 * @param callbackOrLabel - 권한이 없을 때 실행될 콜백 함수 또는 커스텀 검증 함수의 레이블 텍스트
 * @param callback - 권한이 없을 때 실행될 콜백 함수 (커스텀 레이블 사용 시)
 */
export function HasRole(
  allowedRolesOrValidator:
    | string[]
    | ((context: ChatContext) => Promise<boolean> | boolean),
  callbackOrLabel?:
    | string
    | ((
        context: ChatContext,
        allowedRoles: string[] | undefined,
        userRole: string | null
      ) => Promise<void>),
  callback?: (
    context: ChatContext,
    allowedRoles: string[] | undefined,
    userRole: string | null
  ) => Promise<void>
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    // Parse parameters based on types
    let actualCallback: typeof callback | undefined;
    let customLabel: string | undefined;

    if (typeof callbackOrLabel === 'string') {
      // Second parameter is a label, third parameter is callback
      customLabel = callbackOrLabel;
      actualCallback = callback;
    } else if (typeof callbackOrLabel === 'function') {
      // Second parameter is a callback
      actualCallback = callbackOrLabel as typeof callback;
    }

    const wrappedMethod = async function (this: any, context: ChatContext) {
      let isAllowed = false;
      const userType = await context.sender.getType();

      // 커스텀 검증 함수인 경우
      if (typeof allowedRolesOrValidator === 'function') {
        isAllowed = await allowedRolesOrValidator(context);
      }
      // 역할 배열인 경우
      else if (Array.isArray(allowedRolesOrValidator)) {
        isAllowed = !!(userType && allowedRolesOrValidator.includes(userType));
      }

      if (!isAllowed) {
        if (actualCallback) {
          const allowedRoles = Array.isArray(allowedRolesOrValidator)
            ? allowedRolesOrValidator
            : undefined;
          await actualCallback(context, allowedRoles, userType);
          return;
        }
        // 콜백이 없으면 기존 동작 유지 (아무것도 하지 않음)
        return;
      }

      return originalMethod.call(this, context);
    };

    // Store role validator in metadata for HelpCommand filtering
    const existingMetadata = decoratorMetadata.get(originalMethod) || {
      commands: [],
      hasDecorators: false,
    };
    decoratorMetadata.set(originalMethod, {
      ...existingMetadata,
      roleValidator: allowedRolesOrValidator,
      roleLabel: customLabel,
    });

    // Store in original method property
    (originalMethod as any).__roleValidator = allowedRolesOrValidator;
    if (customLabel) {
      (originalMethod as any).__roleLabel = customLabel;
    }

    // CRITICAL: Also store in wrapped method so BotCommand can access it
    (wrappedMethod as any).__roleValidator = allowedRolesOrValidator;
    if (customLabel) {
      (wrappedMethod as any).__roleLabel = customLabel;
    }

    descriptor.value = wrappedMethod;

    return descriptor;
  };
}

/**
 * Decorator that only executes if user is admin (HOST or MANAGER)
 */
export function IsAdmin(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (context: ChatContext) {
    const userType = await context.sender.getType();

    if (userType !== 'HOST' && userType !== 'MANAGER') {
      return;
    }

    return originalMethod.call(this, context);
  };

  return descriptor;
}

/**
 * Decorator that only executes if user is not banned
 */
export function IsNotBanned(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (context: ChatContext) {
    const isBanned = await checkIfUserIsBanned(context.sender.getIdAsString());

    if (isBanned) {
      return;
    }

    return originalMethod.call(this, context);
  };

  return descriptor;
}

/**
 * Decorator for throttling commands (rate limiting)
 * @param maxCalls - 최대 호출 횟수
 * @param windowMs - 시간 창 (밀리초)
 * @param callback - 제한 시 실행될 콜백 함수
 */
export function Throttle(
  maxCalls: number,
  windowMs: number,
  callback?: (
    context: ChatContext,
    maxCalls: number,
    windowMs: number,
    msUntilNext: number
  ) => Promise<void>
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (context: ChatContext) {
      const userId = context.sender.getIdAsString();
      const methodKey = `room${context.room.getIdAsString()}.${target.constructor.name}.${propertyKey}`;
      const now = Date.now();

      if (!throttleStorage.has(methodKey)) {
        throttleStorage.set(methodKey, new Map<string, number[]>());
      }

      const userThrottle = throttleStorage.get(methodKey)!;
      const userCalls = userThrottle.get(userId) || [];

      // Remove calls outside the window
      const validCalls = userCalls.filter(
        (callTime) => now - callTime < windowMs
      );

      if (validCalls.length >= maxCalls) {
        // User has exceeded the limit
        if (callback) {
          const oldestCall = Math.min(...validCalls);
          const msUntilNext = windowMs - (now - oldestCall);
          await callback(context, maxCalls, windowMs, msUntilNext);
        }
        return;
      }

      // Add current call and update storage
      validCalls.push(now);
      userThrottle.set(userId, validCalls);

      return originalMethod.call(this, context);
    };

    return descriptor;
  };
}

/**
 * Room decorator for restricting execution to specific rooms
 * Can be used as both class decorator and method decorator
 * @param roomIds - 허용된 방 ID 배열
 */
export function AllowedRoom(
  roomIds: string[]
): ClassDecorator & MethodDecorator {
  return function (
    target: any,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor
  ): any {
    // Class decorator: target is the constructor
    if (!propertyKey && !descriptor) {
      // Store room restrictions on the class (used by EventManager)
      target.__allowedRooms = roomIds;
      target.prototype.__allowedRooms = roomIds;

      // Store metadata on all methods (for EventManager's isRoomAllowed check)
      const propertyNames = Object.getOwnPropertyNames(target.prototype);
      propertyNames.forEach((name) => {
        if (name === 'constructor') return;

        const propertyDescriptor = Object.getOwnPropertyDescriptor(
          target.prototype,
          name
        );
        if (
          !propertyDescriptor ||
          typeof propertyDescriptor.value !== 'function'
        ) {
          return;
        }

        const method = propertyDescriptor.value;

        // Skip if method already has room restrictions (method-level takes precedence)
        if ((method as any).__allowedRooms) {
          return;
        }

        // Store room restrictions as metadata (EventManager will check this)
        (method as any).__allowedRooms = roomIds;
        (method as any).__decoratorMetadata = {
          ...(method as any).__decoratorMetadata,
          allowedRooms: roomIds,
        };

        // Also store in the metadata map
        const existingMetadata = decoratorMetadata.get(method) || {
          commands: [],
          hasDecorators: false,
        };
        decoratorMetadata.set(method, {
          ...existingMetadata,
          allowedRooms: roomIds,
        });
      });

      return target;
    }

    // Method decorator: propertyKey and descriptor are provided
    if (propertyKey && descriptor) {
      const method = descriptor.value;

      // Store room restrictions in multiple ways for EventManager compatibility
      (method as any).__allowedRooms = roomIds;

      // Store in decorator metadata property
      (method as any).__decoratorMetadata = {
        ...(method as any).__decoratorMetadata,
        allowedRooms: roomIds,
      };

      // Store in the metadata map
      const existingMetadata = decoratorMetadata.get(method) || {
        commands: [],
        hasDecorators: false,
      };
      decoratorMetadata.set(method, {
        ...existingMetadata,
        allowedRooms: roomIds,
      });

      return descriptor;
    }
  };
}

/**
 * Helper function to check if user is banned
 */
async function checkIfUserIsBanned(userId: string): Promise<boolean> {
  // Placeholder implementation - you can extend this with actual ban checking logic
  // For example, check against a database or cache
  const bannedUsers: string[] = []; // Load from your ban system
  return bannedUsers.includes(userId);
}

/**
 * Function-based decorators for easier use (backward compatibility)
 */
export const decorators = {
  hasParam: (handler: DecoratorHandler): DecoratorHandler => {
    return async (context: ChatContext) => {
      if (!context.message.hasParam) {
        return;
      }

      return handler(context);
    };
  },

  isReply: (handler: DecoratorHandler): DecoratorHandler => {
    return async (context: ChatContext) => {
      if (!context.message.isReplyMessage()) {
        return;
      }

      return handler(context);
    };
  },

  isAdmin: (handler: DecoratorHandler): DecoratorHandler => {
    return async (context: ChatContext) => {
      const userType = await context.sender.getType();

      if (userType !== 'HOST' && userType !== 'MANAGER') {
        return;
      }

      return handler(context);
    };
  },

  isNotBanned: (handler: DecoratorHandler): DecoratorHandler => {
    return async (context: ChatContext) => {
      const isBanned = await checkIfUserIsBanned(
        context.sender.getIdAsString()
      );

      if (isBanned) {
        return;
      }

      return handler(context);
    };
  },
};

// Backward compatibility exports
export const hasParam = decorators.hasParam;
export const isReply = decorators.isReply;
export const isAdmin = decorators.isAdmin;
export const isNotBanned = decorators.isNotBanned;

/**
 * Debug function to check room restrictions for a method
 */
export function debugRoomRestrictions(
  method: Function,
  controllerConstructor?: Function
): void {
  console.log('=== Room Restrictions Debug ===');
  console.log('Method:', method.name);

  if ((method as any).__allowedRooms) {
    console.log('Method-level restrictions:', (method as any).__allowedRooms);
  }

  if ((method as any).__decoratorMetadata?.allowedRooms) {
    console.log(
      'Decorator metadata restrictions:',
      (method as any).__decoratorMetadata.allowedRooms
    );
  }

  if (controllerConstructor && (controllerConstructor as any).__allowedRooms) {
    console.log(
      'Controller-level restrictions:',
      (controllerConstructor as any).__allowedRooms
    );
  }

  console.log('=== End Debug ===');
}
