import React, { useState } from 'react';
import { Icon } from './Icon';
import { UserRole } from '../types';

interface LoginProps {
  onLogin: (role: UserRole, label: string, userId: string) => void;
}

type AuthStep = 'LANDING' | 'REGISTER_EMAIL' | 'REGISTER_VERIFY' | 'REGISTER_USERNAME' | 'LOGIN_ID' | 'ROLE_SELECT' | 'PASSCODE';

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [step, setStep] = useState<AuthStep>('LANDING');
  
  // Registration Data
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [username, setUsername] = useState('');
  
  // Security Token (Stores the signed code from the server)
  const [securityToken, setSecurityToken] = useState('');
  
  // Login Data
  const [loginId, setLoginId] = useState(''); // Email or Username

  // Role Selection
  const [selectedRole, setSelectedRole] = useState<{role: UserRole, label: string} | null>(null);
  const [passcode, setPasscode] = useState('');

  // UI State
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [devModeHint, setDevModeHint] = useState(false);

  // --- Actions ---

  const handleSendCode = async () => {
      if (!email.includes('@') || email.length < 5) {
          setError('Please enter a valid email address.');
          return;
      }
      setIsLoading(true);
      setError('');
      setDevModeHint(false);

      try {
          const res = await fetch('/.netlify/functions/send-verification', {
              method: 'POST',
              body: JSON.stringify({ email }),
              headers: { 'Content-Type': 'application/json' }
          });
          
          const data = await res.json();

          if (!res.ok) {
              throw new Error(data.error || 'Failed to send code');
          }

          // Store the secure token for the next step
          setSecurityToken(data.token);
          
          // If the backend is running without email keys, show the log hint
          if (data.devMode) {
              setDevModeHint(true);
          }

          setStep('REGISTER_VERIFY');
      } catch (err: any) {
          setError(err.message || 'Connection failed.');
      } finally {
          setIsLoading(false);
      }
  };

  const handleVerifyCode = async () => {
      if (verificationCode.length < 6) {
          setError('Please enter the 6-digit code.');
          return;
      }
      setIsLoading(true);
      setError('');

      try {
          const res = await fetch('/.netlify/functions/verify-code', {
              method: 'POST',
              body: JSON.stringify({ email, code: verificationCode, token: securityToken }),
              headers: { 'Content-Type': 'application/json' }
          });

          const data = await res.json();

          if (!res.ok) {
              throw new Error(data.error || 'Verification failed');
          }

          setStep('REGISTER_USERNAME');
      } catch (err: any) {
          setError(err.message || 'Verification failed.');
      } finally {
          setIsLoading(false);
      }
  };

  const handleCreateUsername = () => {
      if (username.length < 3) {
          setError('Username must be at least 3 characters.');
          return;
      }
      // Save to "Database" (Local Storage simulation)
      const existingUsersStr = localStorage.getItem('smartgrade_users_db');
      const existingUsers = existingUsersStr ? JSON.parse(existingUsersStr) : [];
      
      // Check uniqueness
      if (existingUsers.some((u: any) => u.username.toLowerCase() === username.toLowerCase())) {
          setError('Username already taken.');
          return;
      }

      const newUser = { email, username, createdAt: Date.now() };
      localStorage.setItem('smartgrade_users_db', JSON.stringify([...existingUsers, newUser]));

      // Proceed to Role Selection using the new username
      setLoginId(username);
      setStep('ROLE_SELECT');
  };

  const handleLoginIdSubmit = () => {
      if (!loginId.trim()) {
          setError('Please enter your username or email.');
          return;
      }
      
      // Admin Bypass Logic
      if (loginId.trim().toLowerCase() === 'admin') {
          setLoginId('Admin'); // Normalize display name
          setStep('ROLE_SELECT');
          return;
      }
      
      // Check if user exists (optional, but good for UX)
      const existingUsersStr = localStorage.getItem('smartgrade_users_db');
      const existingUsers = existingUsersStr ? JSON.parse(existingUsersStr) : [];
      
      const userFound = existingUsers.find((u: any) => 
          u.username.toLowerCase() === loginId.toLowerCase() || 
          u.email.toLowerCase() === loginId.toLowerCase()
      );

      if (!userFound) {
          setError('User not found. Please register first.');
          return;
      }

      // If found, ensure we use the stable username for the session if they entered email
      setLoginId(userFound.username);
      setStep('ROLE_SELECT');
  };

  const handleRoleSelect = (role: UserRole, label: string) => {
      setSelectedRole({ role, label });
      if (role === 'TEACHER') {
          setStep('PASSCODE');
          setPasscode('');
          setError('');
      } else {
          // Assessors login immediately
          onLogin(role, label, loginId);
      }
  };

  const verifyPasscode = () => {
      if (passcode === '123456') {
          if (selectedRole) {
              onLogin(selectedRole.role, selectedRole.label, loginId);
          }
      } else {
          setError('Invalid access code');
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
      if (e.key === 'Enter') action();
  };

  // --- Render Helpers ---

  const BackButton = ({ to }: { to: AuthStep }) => (
      <button 
        onClick={() => { setError(''); setStep(to); }}
        className="text-sm text-slate-400 hover:text-slate-600 font-medium mb-6 flex items-center gap-1"
      >
          ← Back
      </button>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative min-h-[600px]">
        
        {/* Left Side - Brand */}
        <div className="w-full md:w-1/2 bg-gradient-to-br from-blue-600 to-purple-700 p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6 shadow-lg animate-float">
               <Icon.Logo className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4 flex items-start">
              SmartGrade AI<span className="text-2xl text-blue-200 align-top relative -top-2">+</span>
            </h1>
            <p className="text-blue-100 text-lg leading-relaxed">
              The intelligent grading assistant for modern educators. Streamline assessments, manage groups, and generate AI-powered feedback.
            </p>
          </div>

          <div className="relative z-10 mt-12 text-sm text-blue-200">
            <p>&copy; 2026 SmartGrade AI<span className="text-[10px] align-top relative -top-0.5">+</span></p>
            <p className="mt-1 opacity-75">Created by Versed</p>
          </div>
        </div>

        {/* Right Side - Dynamic Auth Flow */}
        <div className="w-full md:w-1/2 p-12 flex flex-col justify-center bg-white relative animate-fade-in">
          
          {/* STEP 1: LANDING */}
          {step === 'LANDING' && (
            <div className="text-center animate-fade-in">
                <h2 className="text-3xl font-bold text-slate-800 mb-1">Get Started</h2>
                <p className="text-slate-500 mb-6">Access your intelligent grading workspace.</p>
                
                <div className="space-y-4">
                    <button 
                        onClick={() => setStep('LOGIN_ID')}
                        className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                        Sign In
                    </button>
                    <button 
                        onClick={() => setStep('REGISTER_EMAIL')}
                        className="w-full bg-white border border-slate-200 text-slate-700 py-4 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all"
                    >
                        Create Account
                    </button>
                </div>
            </div>
          )}

          {/* REGISTER FLOW: EMAIL */}
          {step === 'REGISTER_EMAIL' && (
              <div className="animate-fade-in">
                  <BackButton to="LANDING" />
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Create Account</h2>
                  <p className="text-slate-500 mb-8 text-sm">Please enter your email address to begin.</p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
                          <input 
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, handleSendCode)}
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="name@school.edu"
                              autoFocus
                          />
                      </div>
                      {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
                      <button 
                          onClick={handleSendCode}
                          disabled={isLoading}
                          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                      >
                          {isLoading ? 'Sending...' : 'Verify Email'}
                      </button>
                  </div>
              </div>
          )}

          {/* REGISTER FLOW: VERIFY */}
          {step === 'REGISTER_VERIFY' && (
              <div className="animate-fade-in">
                  <BackButton to="REGISTER_EMAIL" />
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Check your email</h2>
                  <p className="text-slate-500 mb-4 text-sm">We've sent a code to <strong>{email}</strong></p>
                  
                  {devModeHint && (
                      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-xs text-yellow-800 mb-4">
                          <strong>Demo Mode:</strong> The email system is not configured with SMTP keys. 
                          <br />
                          Check the <strong>Browser Console</strong> or <strong>Netlify Function Logs</strong> to see the generated code.
                      </div>
                  )}

                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Verification Code</label>
                          <input 
                              type="text"
                              value={verificationCode}
                              onChange={(e) => setVerificationCode(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, handleVerifyCode)}
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none tracking-widest text-center text-lg"
                              placeholder="XXXXXX"
                              autoFocus
                          />
                      </div>
                      {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
                      <button 
                          onClick={handleVerifyCode}
                          disabled={isLoading}
                          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                      >
                          {isLoading ? 'Verifying...' : 'Confirm Code'}
                      </button>
                  </div>
              </div>
          )}

          {/* REGISTER FLOW: USERNAME */}
          {step === 'REGISTER_USERNAME' && (
              <div className="animate-fade-in">
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Create Username</h2>
                  <p className="text-slate-500 mb-8 text-sm">Choose a unique username for your account.</p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Username</label>
                          <input 
                              type="text"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, handleCreateUsername)}
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="e.g. TeacherJane"
                              autoFocus
                          />
                      </div>
                      {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
                      <button 
                          onClick={handleCreateUsername}
                          className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-200"
                      >
                          Complete Registration
                      </button>
                  </div>
              </div>
          )}

          {/* LOGIN FLOW: ID INPUT */}
          {step === 'LOGIN_ID' && (
              <div className="animate-fade-in">
                  <BackButton to="LANDING" />
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome Back</h2>
                  <p className="text-slate-500 mb-8 text-sm">Sign in to continue to SmartGrade AI+</p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Username or Email</label>
                          <input 
                              type="text"
                              value={loginId}
                              onChange={(e) => setLoginId(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, handleLoginIdSubmit)}
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="e.g. TeacherJane"
                              autoFocus
                          />
                      </div>
                      {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
                      <button 
                          onClick={handleLoginIdSubmit}
                          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                      >
                          Continue
                      </button>
                  </div>
              </div>
          )}

          {/* SHARED FLOW: ROLE SELECTION */}
          {step === 'ROLE_SELECT' && (
             <div className="animate-fade-in">
                <button 
                    onClick={() => setStep('LANDING')}
                    className="text-xs text-slate-400 hover:text-red-500 font-medium mb-6 flex items-center gap-1 float-right"
                >
                    Sign Out
                </button>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Select Role</h2>
                <p className="text-slate-500 mb-6 text-sm">Logged in as <strong className="text-slate-800">{loginId}</strong></p>

                <div className="space-y-3">
                    <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Educators</label>
                    <button 
                        onClick={() => handleRoleSelect('TEACHER', 'Main Teacher')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 hover:shadow-md transition-all group text-left"
                    >
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Icon.Users />
                        </div>
                        <div>
                        <h3 className="font-bold text-slate-800 text-sm">Main Teacher</h3>
                        </div>
                    </button>

                    <button 
                        onClick={() => handleRoleSelect('TEACHER', 'Co-Teacher')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50 hover:shadow-md transition-all group text-left"
                    >
                        <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        <Icon.Users />
                        </div>
                        <div>
                        <h3 className="font-bold text-slate-800 text-sm">Co-Teacher</h3>
                        </div>
                    </button>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-slate-100">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assessment</label>
                    <button 
                        onClick={() => handleRoleSelect('ASSESSOR', 'Internal Assessor')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-orange-500 hover:bg-orange-50 hover:shadow-md transition-all group text-left"
                    >
                        <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-colors">
                        <Icon.Check />
                        </div>
                        <div>
                        <h3 className="font-bold text-slate-800 text-sm">Internal Assessor</h3>
                        </div>
                    </button>

                    <button 
                        onClick={() => handleRoleSelect('ASSESSOR', 'External Assessor')}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-green-500 hover:bg-green-50 hover:shadow-md transition-all group text-left"
                    >
                        <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                        <Icon.DocumentText />
                        </div>
                        <div>
                        <h3 className="font-bold text-slate-800 text-sm">External Assessor</h3>
                        </div>
                    </button>
                    </div>
                </div>
             </div>
          )}
          
          {/* TEACHER PASSCODE OVERLAY */}
          {step === 'PASSCODE' && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-20 flex items-center justify-center p-8 rounded-r-3xl animate-fade-in">
                  <div className="w-full max-w-sm">
                      <div className="text-center mb-6">
                          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                              </svg>
                          </div>
                          <h3 className="text-xl font-bold text-slate-800">Enter Access Code</h3>
                          <p className="text-sm text-slate-500">Security verification for {selectedRole?.label}</p>
                      </div>
                      
                      <div className="space-y-4">
                          <input 
                              type="password"
                              autoFocus
                              value={passcode}
                              onChange={(e) => setPasscode(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, verifyPasscode)}
                              placeholder="Access Code"
                              className="w-full text-center text-2xl tracking-widest p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          {error && <p className="text-red-500 text-center text-sm font-bold">{error}</p>}
                          
                          <button 
                              onClick={verifyPasscode}
                              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                          >
                              Verify
                          </button>
                          <button 
                              onClick={() => { setStep('ROLE_SELECT'); setPasscode(''); setError(''); }}
                              className="w-full text-slate-400 hover:text-slate-600 text-sm font-medium"
                          >
                              Cancel
                          </button>
                      </div>
                  </div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};