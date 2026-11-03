// @rev kc-31
import { bookingRepo, masters, services } from './store.ts';
import { createBookingService } from './booking.ts';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3002);

const booking = createBookingService({ masters, services, repo: bookingRepo });

createApp(booking, masters, services).listen(port, () => {
  console.log(`booking: http://localhost:${port}`);
});
