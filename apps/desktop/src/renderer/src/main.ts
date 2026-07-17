import { createApp } from '@oscillo-synth/ui-web';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app root element');
createApp(root);
