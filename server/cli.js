// 命令列：npm run update / npm run backfill / npm run diagnose
import { runUpdate, jobState } from './jobs/update.js';
import { diagnose } from './jobs/diagnose.js';

const cmd = process.argv[2];

if (cmd === 'diagnose') {
  const r = await diagnose();
  for (const x of r.results) {
    console.log(`${x.ok ? '✔' : '✘'} ${x.name}（${x.ms}ms）`);
    console.log(`   ${x.ok ? x.sample : x.error}`);
  }
} else if (cmd === 'update' || cmd === 'backfill') {
  const timer = setInterval(() => {
    const s = jobState();
    if (s.stage) process.stdout.write(`\r${s.stage} ${s.done}/${s.total}        `);
  }, 2000);
  try {
    await runUpdate({ backfill: cmd === 'backfill' });
  } finally {
    clearInterval(timer);
    console.log('');
  }
} else {
  console.log('用法：node server/cli.js update | backfill | diagnose');
}
