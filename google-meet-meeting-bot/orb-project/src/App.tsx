import Orb from './Orb';
import './App.css';

function App() {
  return (
    <div className="app-container" style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Orb hue={0} backgroundColor="#000000" />
    </div>
  );
}

export default App;
