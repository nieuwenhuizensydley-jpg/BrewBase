import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:40,fontFamily:"sans-serif",background:"#f0f0eb",minHeight:"100vh"}}>
          <h2 style={{color:"#c0392b"}}>Something went wrong</h2>
          <p style={{color:"#555"}}>{this.state.error?.message}</p>
          <button onClick={()=>window.location.reload()} style={{padding:"10px 20px",background:"#3d7a47",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:15}}>Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
