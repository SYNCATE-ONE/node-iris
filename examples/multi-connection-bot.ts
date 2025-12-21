// /**
//  * Example: Multi-connection and Message Queue Bot
//  * node-iris v1.6.50+ 다중 연결 및 메시지 큐 기능 예제
//  */

// import {
//   Bot,
//   MessageController,
//   Command,
//   OnMessage,
//   ChatContext,
// } from '../src';

// // 메시지 컨트롤러
// @MessageController
// class CommandController {
//   @Command('핑')
//   async ping(ctx: ChatContext) {
//     await ctx.room.send('퐁! 🏓');
//   }

//   @Command('통계')
//   async stats(ctx: ChatContext) {
//     const bot = Bot.requireInstance();
//     const connStats = bot.getConnectionStats();
//     const queueStats = bot.getQueueStats();

//     let message = '📊 **봇 통계**\n\n';

//     if (connStats) {
//       message += `🔗 연결 상태:\n`;
//       message += `  - 전체: ${connStats.total}개\n`;
//       message += `  - 연결됨: ${connStats.connected}개\n`;
//       message += `  - 끊어짐: ${connStats.disconnected}개\n`;
//       message += `  - 오류: ${connStats.error}개\n`;
//       message += `  - 총 메시지: ${connStats.totalMessages}개\n\n`;
//     }

//     if (queueStats) {
//       message += `📨 메시지 큐:\n`;
//       message += `  - 대기 중: ${queueStats.queued}개\n`;
//       message += `  - 처리 중: ${queueStats.processing}개\n`;
//       message += `  - 완료: ${queueStats.completed}개\n`;
//       message += `  - 실패: ${queueStats.failed}개\n`;
//       message += `  - 드롭됨: ${queueStats.dropped}개\n`;
//       message += `  - 평균 처리 시간: ${queueStats.avgProcessingTime.toFixed(2)}ms\n`;
//     }

//     await ctx.room.send(message);
//   }

//   @Command('도움말')
//   async help(ctx: ChatContext) {
//     const helpText = `
// 📖 **명령어 목록**

// • /핑 - 봇 응답 확인
// • /통계 - 연결 및 큐 통계 확인
// • /도움말 - 이 메시지 표시
//     `.trim();

//     await ctx.room.send(helpText);
//   }

//   @OnMessage()
//   async onMessage(ctx: ChatContext) {
//     // 모든 메시지에 대해 로깅 (옵션)
//     const senderName = await ctx.sender.getName();
//     console.log(`[${ctx.room.name}] ${senderName}: ${ctx.message.msg}`);
//   }
// }

// async function main() {
//   // 환경변수에서 설정 가져오기
//   const IRIS_URL = process.env.IRIS_URL || '127.0.0.1:3000';
//   const IRIS_URL_2 = process.env.IRIS_URL_2; // 선택적 두 번째 서버

//   // 봇 생성 (다중 연결 및 메시지 큐 활성화)
//   const bot = new Bot('MultiBot', IRIS_URL, {
//     logLevel: 'info',

//     // 다중 연결 모드 (여러 Iris 서버에 동시 연결)
//     multiConnection: !!IRIS_URL_2, // 두 번째 URL이 있을 때만 활성화
//     connections: IRIS_URL_2 ? [{ id: 'server2', url: IRIS_URL_2 }] : undefined,

//     // 연결 관리자 옵션
//     connectionOptions: {
//       maxReconnectAttempts: 10, // 최대 재연결 시도 횟수
//       initialReconnectDelay: 1000, // 초기 재연결 지연 (1초)
//       maxReconnectDelay: 60000, // 최대 재연결 지연 (1분)
//       connectionTimeout: 15000, // 연결 타임아웃 (15초)
//       healthCheckInterval: 30000, // 헬스 체크 간격 (30초)
//     },

//     // 메시지 큐 (명령어 씹힘 방지)
//     useMessageQueue: true,
//     messageQueueOptions: {
//       maxConcurrent: 15, // 동시 처리 가능한 최대 메시지 수
//       maxQueueSize: 500, // 최대 큐 크기
//       maxRetries: 3, // 최대 재시도 횟수
//       retryDelay: 100, // 재시도 지연 (ms)
//       processingTimeout: 30000, // 메시지 처리 타임아웃 (30초)
//       priorityEnabled: true, // 우선순위 처리 활성화
//     },

//     // 이벤트 처리 옵션 (병렬 처리로 속도 향상)
//     parallelEventHandling: true, // 이벤트 핸들러 병렬 실행
//     eventTimeout: 60000, // 이벤트 핸들러 타임아웃 (1분)
//   });

//   // 컨트롤러 등록
//   bot.addController(new CommandController());

//   // 에러 핸들러
//   bot.on('error', (errorContext) => {
//     console.error('봇 오류:', {
//       event: errorContext.event,
//       error: errorContext.exception?.message,
//     });
//   });

//   console.log('🤖 봇을 시작합니다...');
//   console.log(`   메인 서버: ${IRIS_URL}`);
//   if (IRIS_URL_2) {
//     console.log(`   보조 서버: ${IRIS_URL_2}`);
//   }

//   // 봇 실행
//   await bot.run();
// }

// // 프로세스 종료 처리
// process.on('SIGINT', () => {
//   console.log('\n봇을 종료합니다...');
//   const bot = Bot.getInstance();
//   if (bot) {
//     bot.stop();
//   }
//   process.exit(0);
// });

// process.on('SIGTERM', () => {
//   const bot = Bot.getInstance();
//   if (bot) {
//     bot.stop();
//   }
//   process.exit(0);
// });

// main().catch(console.error);
