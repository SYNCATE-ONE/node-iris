# 다중 연결 및 메시지 큐 기능

node-iris v1.7.0부터 다중 WebSocket 연결과 메시지 큐 시스템을 지원합니다.

## 주요 개선 사항

### 1. 다중 WebSocket 연결 지원

여러 Iris 서버에 동시에 연결하여 메시지를 수신할 수 있습니다.

```typescript
import { Bot } from 'node-iris';

const bot = new Bot('MyBot', '192.168.1.100:3000', {
  // 다중 연결 모드 활성화
  multiConnection: true,

  // 추가 연결 설정
  connections: [
    { id: 'server2', url: '192.168.1.101:3000' },
    { id: 'server3', url: '192.168.1.102:3000', enabled: true },
  ],

  // 연결 관리자 옵션
  connectionOptions: {
    maxReconnectAttempts: 5, // 최대 재연결 시도 횟수
    initialReconnectDelay: 1000, // 초기 재연결 지연 (ms)
    maxReconnectDelay: 30000, // 최대 재연결 지연 (ms)
    connectionTimeout: 10000, // 연결 타임아웃 (ms)
    healthCheckInterval: 30000, // 헬스 체크 간격 (ms)
  },
});

await bot.run();
```

### 2. 메시지 큐 시스템

메시지를 큐에 넣고 병렬로 처리하여 명령어가 씹히는 문제를 방지합니다.

```typescript
const bot = new Bot('MyBot', '192.168.1.100:3000', {
  // 메시지 큐 사용 (기본값: true)
  useMessageQueue: true,

  // 메시지 큐 옵션
  messageQueueOptions: {
    maxConcurrent: 10, // 동시 처리 가능한 최대 메시지 수
    maxQueueSize: 1000, // 최대 큐 크기
    maxRetries: 3, // 최대 재시도 횟수
    retryDelay: 100, // 재시도 지연 (ms)
    processingTimeout: 30000, // 메시지 처리 타임아웃 (ms)
    priorityEnabled: true, // 우선순위 처리 활성화
  },
});
```

### 3. 이벤트 핸들러 병렬 처리

이벤트 핸들러들이 병렬로 실행되어 처리 속도가 향상됩니다.

```typescript
const bot = new Bot('MyBot', '192.168.1.100:3000', {
  // 이벤트 핸들러 병렬 처리 (기본값: true)
  parallelEventHandling: true,

  // 이벤트 핸들러 타임아웃 (ms)
  eventTimeout: 30000,
});
```

## 런타임에 연결 추가

봇이 실행 중일 때도 새로운 연결을 추가할 수 있습니다:

```typescript
// 다중 연결 모드에서만 동작
bot.addConnection({
  id: 'newServer',
  url: '192.168.1.103:3000',
});
```

## 통계 확인

연결 상태와 메시지 큐 통계를 확인할 수 있습니다:

```typescript
// 연결 통계
const connectionStats = bot.getConnectionStats();
console.log('연결 통계:', connectionStats);
// { total: 3, connected: 3, disconnected: 0, error: 0, totalMessages: 150 }

// 메시지 큐 통계
const queueStats = bot.getQueueStats();
console.log('큐 통계:', queueStats);
// { queued: 2, processing: 5, completed: 143, failed: 0, dropped: 0, avgProcessingTime: 25.5 }
```

## 전체 예제

```typescript
import { Bot, MessageController, Command } from 'node-iris';

@MessageController()
class MyController {
  @Command('핑')
  async ping(ctx) {
    await ctx.room.send('퐁!');
  }

  @Command('통계')
  async stats(ctx) {
    const bot = Bot.requireInstance();
    const connStats = bot.getConnectionStats();
    const queueStats = bot.getQueueStats();

    await ctx.room.send(
      `연결: ${connStats?.connected}/${connStats?.total}\n` +
        `큐: ${queueStats?.queued}개 대기, ${queueStats?.processing}개 처리 중`
    );
  }
}

async function main() {
  const bot = new Bot('MultiBot', process.env.IRIS_URL!, {
    logLevel: 'info',

    // 다중 연결
    multiConnection: true,
    connections: [
      { id: 'phone1', url: process.env.IRIS_URL_1! },
      { id: 'phone2', url: process.env.IRIS_URL_2! },
    ],

    // 메시지 큐
    useMessageQueue: true,
    messageQueueOptions: {
      maxConcurrent: 15,
      maxQueueSize: 500,
    },

    // 병렬 처리
    parallelEventHandling: true,
    eventTimeout: 60000,
  });

  bot.addController(new MyController());

  await bot.run();
}

main().catch(console.error);
```

## 명령어 씹힘 문제 해결

이전 버전에서 명령어가 씹히는 문제가 발생했던 이유:

1. **순차적 이벤트 처리**: 이벤트 핸들러가 하나씩 순차적으로 실행되어 이전 명령어 처리가 끝나야 다음 명령어 처리 가능
2. **동기적 메시지 수신**: WebSocket에서 메시지를 받으면 처리가 완료될 때까지 다음 메시지 수신이 지연
3. **단일 연결**: 하나의 WebSocket 연결만 사용하여 메시지 수신 용량 제한

**해결 방안:**

1. **메시지 큐 시스템**: 메시지를 즉시 큐에 추가하고 워커가 비동기적으로 처리
2. **병렬 이벤트 처리**: 여러 이벤트 핸들러가 동시에 실행
3. **다중 연결 지원**: 여러 Iris 서버에 연결하여 부하 분산

## 마이그레이션 가이드

기존 코드는 그대로 동작합니다. 새 기능을 사용하려면 옵션만 추가하면 됩니다:

```typescript
// 기존 코드 (변경 없이 동작)
const bot = new Bot('MyBot', '192.168.1.100:3000');

// 새 기능 활성화
const bot = new Bot('MyBot', '192.168.1.100:3000', {
  multiConnection: true,
  useMessageQueue: true, // 기본값이 true이므로 생략 가능
  parallelEventHandling: true, // 기본값이 true이므로 생략 가능
});
```
