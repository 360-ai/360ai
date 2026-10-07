import { erinnerungVermerken } from '../../../lib/agent.js';
import { mitDaten } from '../../../lib/agent-route.js';

// POST /api/agent/vorbereitung/erinnert {lead_id}  Erinnerung ist raus, nicht noch einmal schicken.
export const onRequestPost = (context) => mitDaten(context, erinnerungVermerken);
