import { Xendit } from 'xendit-node';

const XENDIT_API_KEY = process.env.XENDIT_API_KEY || '';

const xenditClient = new Xendit({
  secretKey: XENDIT_API_KEY
});

export default xenditClient;
