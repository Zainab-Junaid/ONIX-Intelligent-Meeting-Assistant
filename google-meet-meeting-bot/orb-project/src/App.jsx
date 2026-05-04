import Orb from './Orb';
import './App.css';

function App() {
  return (
    <div className="App">
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ width: '400px', height: '400px' }}>
          <Orb hue={0} backgroundColor="#000000" />
        </div>
      </div>
    </div>
  );
}

export default App;