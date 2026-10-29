import { handle } from '../../../newsletter/service.mjs';
export const onRequest = ({ request, env }) => handle(request, env);
