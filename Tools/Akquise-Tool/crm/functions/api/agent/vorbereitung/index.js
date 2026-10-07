import { vorbereitungVermerken } from '../../../lib/agent.js';
import { mitDaten } from '../../../lib/agent-route.js';

// POST /api/agent/vorbereitung {lead_id, kennung, link, mail?, begruessung?, anrede?, frist?, termin?}
// Vermerkt den verschickten Link, setzt Fragebogen raus und die Wiedervorlage auf die Frist.
export const onRequestPost = (context) => mitDaten(context, vorbereitungVermerken);
