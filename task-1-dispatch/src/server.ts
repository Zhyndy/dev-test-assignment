// @rev kc-31
import { branches, orders } from './store.ts';
import { createDispatch } from './dispatch.ts';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3001);

createApp(createDispatch(branches, orders), branches, orders).listen(port, () => {
  console.log(`dispatch: http://localhost:${port}`);
});
