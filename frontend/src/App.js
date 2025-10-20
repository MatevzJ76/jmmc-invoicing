import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const Home = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-2xl">
        <div className="space-y-3">
          <h1 className="text-5xl font-bold text-slate-800 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Emergent Invoicing
          </h1>
          <p className="text-xl text-slate-600" style={{ fontFamily: "'Inter', sans-serif" }}>
            Monthly invoicing system for time tracking & invoice management
          </p>
        </div>
        
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-slate-200">
          <h2 className="text-2xl font-semibold text-slate-700 mb-4">🎉 Setup Complete!</h2>
          <div className="space-y-3 text-left">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-green-800 mb-2">✅ Default Users Created:</p>
              <div className="space-y-2 text-sm text-green-700 font-mono">
                <div>
                  <span className="font-bold">Admin:</span> admin@local
                </div>
                <div>
                  <span className="font-bold">User:</span> user@local
                </div>
              </div>
              <p className="text-xs text-green-600 mt-2">Check backend logs for OTPs</p>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">Next Step:</span> I'm ready to implement the complete invoicing system with:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-blue-700">
                <li>• Login & Authentication (JWT)</li>
                <li>• XLSX Import & Validation</li>
                <li>• Invoice Composition & Editing</li>
                <li>• AI Features (Grammar, Fraud, GDPR)</li>
                <li>• eRačuni Integration (stub mode)</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-sm text-slate-600">
              Type <span className="font-mono bg-slate-100 px-2 py-1 rounded">"continue with full implementation"</span> to proceed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
