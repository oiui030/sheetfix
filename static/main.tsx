import {createRoot} from 'react-dom/client';
import Editor from '../app/editor';
import '../app/globals.css';

const root = document.getElementById('root');
if (!root) throw Error('root missing');
createRoot(root).render(<Editor signedIn={false} cloud={false} />);
