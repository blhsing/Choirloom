import {installDiagnostics} from './diagnostics';
import React from 'react';import {createRoot} from 'react-dom/client';import App from './App';import '@fontsource/noto-sans-tc/400.css';import '@fontsource/noto-sans-tc/600.css';import './styles.css';
installDiagnostics();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
