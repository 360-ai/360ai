import { eingangVermerken } from '../../../lib/agent.js';
import { mitDaten } from '../../../lib/agent-route.js';

// POST /api/agent/vorbereitung/eingang {kennung, fassung?, kurzfassung?}
// Ruecklauf ist da: Phase Fragebogen da, Notiz, Wiedervorlage auf den Termin. Liefert die Lead-Daten.
export const onRequestPost = (context) => mitDaten(context, eingangVermerken);
