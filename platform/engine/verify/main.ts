/**
 * Standalone verifier page (verify.html): the verifier core mounted on its own, so it also works offline.
 */

import { mountVerifier } from './core';

mountVerifier(document.getElementById('verifier')!);
