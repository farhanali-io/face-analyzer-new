
import { useEffect } from 'react';
import './index.css';
import './slush.css';
import './faceAnalyzer.js';
import './deepScan.js';
import './ribbon.js';

export default function App() {
  useEffect(() => {
    // your face-analyzer logic in those JS files will run and attach to #root or body
    console.log("Face Analyzer loaded");
  }, []);

  return (
    <div id="app-container">
      {/* Your tool UI - if your JS files create their own DOM, leave this empty */}
      {/* If they need a container, add it here */}
      <div id="face-analyzer-root"></div>
    </div>
  );
}
