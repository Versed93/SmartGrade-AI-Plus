import React, { useState, useEffect } from 'react';
import { Assignee, Assessment, PeerEvaluation, Rubric } from '../types';
import { Icon } from './Icon';

interface StudentPeerEvalProps {
  assignees: Assignee[];
  assessments: Record<string, Assessment>;
  rubric: Rubric;
  onSaveAssessment: (id: string, assessment: Assessment) => void;
  onExit: () => void;
  hostUserId?: string;
  isGuest?: boolean;
}

// Extended questionnaire form state
interface EvaluationForm {
  q1: number; // Contribution
  q2: number; // Quality
  q3: number; // Teamwork
  q4: number; // Quality of Work (New)
  q5: number; // Problem Solving & Initiative (New)
  feedback: string;
}

type Mode = 'STUDENT_MODE' | 'TEACHER_MODE';

export const StudentPeerEval: React.FC<StudentPeerEvalProps> = ({ 
    assignees, 
    assessments, 
    rubric, 
    onSaveAssessment, 
    onExit, 
    hostUserId, 
    isGuest = false 
}) => {
  const [mode, setMode] = useState<Mode>(isGuest ? 'STUDENT_MODE' : 'TEACHER_MODE');
  // If guest, skip landing and go straight to search
  const [step, setStep] = useState<'KIOSK_START' | 'SEARCH' | 'SELECT_SELF' | 'EVALUATE' | 'SUCCESS'>(isGuest ? 'SEARCH' : 'KIOSK_START');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  
  // Verification State
  const [verificationQuery, setVerificationQuery] = useState('');
  const [verificationError, setVerificationError] = useState('');
  
  // Store detailed answers per teammate
  const [evalForms, setEvalForms] = useState<Record<string, EvaluationForm>>({});

  useEffect(() => {
    if (isGuest) {
        setMode('STUDENT_MODE');
        setStep('SEARCH');
    }
  }, [isGuest]);

  const groups = assignees.filter(a => a.type === 'group');
  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const startStudentMode = () => {
    setStep('SEARCH');
  };

  // Helper to safely match user input against member strings (ID, Name format)
  const isMemberMatch = (memberString: string, query: string) => {
      if (!query || query.length < 2) return false; // Prevent matching on single characters
      const q = query.toLowerCase();
      // Split "S101, John Doe" -> ["s101", "john doe"]
      const parts = memberString.split(',').map(s => s.trim().toLowerCase());
      
      return parts.some(part => {
          // Exact match ID or Name
          if (part === q) return true;
          // Check for Name segments (e.g. "John" matches "John Doe")
          if (part.includes(' ')) {
              const nameParts = part.split(' ');
              return nameParts.some(np => np === q);
          }
          return false;
      });
  };

  const handleSearch = () => {
    setSearchError('');
    if (!searchQuery.trim()) {
        setSearchError('Please enter your Student ID to log in.');
        return;
    }

    const query = searchQuery.trim().toLowerCase();
    
    // 1. Check if query matches a Student ID or Name directly in any group
    let foundStudentGroup: Assignee | undefined;
    let foundStudentName: string | undefined;

    for (const group of groups) {
        if (group.members) {
             const matchedMember = group.members.find(m => isMemberMatch(m, query));
             if (matchedMember) {
                 foundStudentGroup = group;
                 foundStudentName = matchedMember;
                 break;
             }
        }
    }

    if (foundStudentGroup && foundStudentName) {
        setSelectedGroupId(foundStudentGroup.id);
        // Auto-select the user and go straight to evaluation
        handleUserSelect(foundStudentName, foundStudentGroup); 
        return;
    }

    // 2. Fallback: Check if query matches a Group ID or Name (Group Login)
    const groupMatch = groups.find(g => g.id.toLowerCase() === query || g.name.toLowerCase() === query);
    if (groupMatch) {
        setSelectedGroupId(groupMatch.id);
        setVerificationQuery(''); 
        setVerificationError('');
        setStep('SELECT_SELF');
        return;
    }

    // If we reach here, neither student nor group was found in the roster
    setSearchError('ID not found in student list. Please check your spelling.');
  };

  const handleVerification = () => {
      setVerificationError('');
      if (!selectedGroup || !verificationQuery.trim()) {
          setVerificationError('Please enter your Name or ID');
          return;
      }

      const query = verificationQuery.trim();
      const match = selectedGroup.members?.find(m => isMemberMatch(m, query));
      
      if (match) {
          handleUserSelect(match);
      } else {
          setVerificationError('Student not found in this group. Please check ID or Name.');
      }
  };

  const handleUserSelect = (name: string, group: Assignee | undefined = selectedGroup) => {
    if (!group) return;
    
    setCurrentUser(name);
    // Initialize forms for teammates (exclude self)
    const initialForms: Record<string, EvaluationForm> = {};
    group.members?.forEach(m => {
      if (m !== name) {
        initialForms[m] = { 
            q1: 5, // Default to middle score
            q2: 5, 
            q3: 5, 
            q4: 5, 
            q5: 5, 
            feedback: '' 
        };
      }
    });
    setEvalForms(initialForms);
    setStep('EVALUATE');
  };

  const handleFormChange = (subject: string, field: keyof EvaluationForm, value: any) => {
    setEvalForms(prev => ({
      ...prev,
      [subject]: {
        ...prev[subject],
        [field]: value
      }
    }));
  };

  const calculateFinalScore = (form: EvaluationForm) => {
    // Average of 5 questions (each 1-10) scaled to 0-100
    const avg = (form.q1 + form.q2 + form.q3 + form.q4 + form.q5) / 5;
    return Math.round(avg * 10);
  };

  const handleSubmit = () => {
    if (!selectedGroupId || !currentUser || !selectedGroup) return;

    const compositeKey = `${rubric.id}_${selectedGroupId}`;
    
    // Get existing assessment or create new structure
    const existingAssessment = assessments[compositeKey] || {
      id: compositeKey,
      rubricId: rubric.id,
      assigneeId: selectedGroupId,
      entries: [],
      peerEvaluations: [],
      totalScore: 0,
      maxScore: 0,
      feedback: '',
      locked: false,
      lastUpdated: Date.now()
    };

    const newEvaluations: PeerEvaluation[] = [
      ...(existingAssessment.peerEvaluations || [])
    ];

    // Remove any previous reviews BY this user FOR these subjects to prevent duplicates
    const cleanedEvaluations = newEvaluations.filter(e => e.evaluator !== currentUser);

    // Add new reviews
    (Object.entries(evalForms) as [string, EvaluationForm][]).forEach(([subject, form]) => {
      cleanedEvaluations.push({
        id: crypto.randomUUID(),
        evaluator: currentUser,
        subject: subject,
        score: calculateFinalScore(form),
        feedback: form.feedback
      });
    });

    onSaveAssessment(compositeKey, {
      ...existingAssessment,
      peerEvaluations: cleanedEvaluations,
      lastUpdated: Date.now()
    });

    setStep('SUCCESS');
  };

  const reset = () => {
    setStep(isGuest ? 'SEARCH' : 'KIOSK_START');
    setSearchQuery('');
    setSearchError('');
    setSelectedGroupId(null);
    setCurrentUser(null);
    setEvalForms({});
  };

  // Improved Rating Slider UI
  const renderRatingInput = (
    value: number, 
    onChange: (val: number) => void, 
    activeColorClass: string
  ) => {
    let textColor = 'text-purple-600';
    let rangeColor = 'accent-purple-600';
    let bgLight = 'bg-purple-50';

    if (activeColorClass.includes('blue')) {
        textColor = 'text-blue-600';
        rangeColor = 'accent-blue-600';
        bgLight = 'bg-blue-50';
    } else if (activeColorClass.includes('green')) {
        textColor = 'text-green-600';
        rangeColor = 'accent-green-600';
        bgLight = 'bg-green-50';
    } else if (activeColorClass.includes('orange')) {
        textColor = 'text-orange-600';
        rangeColor = 'accent-orange-600';
        bgLight = 'bg-orange-50';
    } else if (activeColorClass.includes('rose')) {
        textColor = 'text-rose-600';
        rangeColor = 'accent-rose-600';
        bgLight = 'bg-rose-50';
    }

    const getLabel = (v: number) => {
        if (v <= 2) return "Poor";
        if (v <= 4) return "Fair";
        if (v <= 6) return "Average";
        if (v <= 8) return "Good";
        return "Excellent";
    };

    return (
        <div className={`rounded-2xl p-4 md:p-6 border border-slate-200 shadow-sm ${bgLight} transition-all`}>
            <div className="flex justify-between items-center mb-4 md:mb-6">
                <div className="flex flex-col">
                     <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Score</span>
                     <span className={`text-base font-bold ${textColor} uppercase tracking-wide`}>{getLabel(value)}</span>
                </div>
                <div className="text-right">
                    <span className={`text-4xl md:text-5xl font-black ${textColor} leading-none`}>{value}</span>
                    <span className="text-slate-400 text-lg font-medium">/10</span>
                </div>
            </div>
            
            <div className="relative w-full h-8 flex items-center">
                {/* Background Track Lines */}
                <div className="absolute w-full flex justify-between px-1 pointer-events-none opacity-30">
                     {[...Array(10)].map((_, i) => <div key={i} className="w-0.5 h-2 bg-slate-400"></div>)}
                </div>

                <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="1"
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className={`w-full h-3 bg-white rounded-full appearance-none cursor-pointer shadow-sm border border-slate-200 ${rangeColor}`}
                />
            </div>
            
            <div className="flex justify-between mt-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                 <span>Low</span>
                 <span>High</span>
            </div>
        </div>
    );
  };

  // QR Code URL (Points to current page with connection params)
  const qrUrlData = `${window.location.origin}${window.location.pathname}?mode=student&tId=${hostUserId || ''}&rId=${rubric.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrlData)}`;

  // Teacher Monitor View Component
  const TeacherMonitor = () => {
    return (
        <div className="max-w-6xl mx-auto w-full p-6 animate-fade-in">
             <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Live Peer Evaluation Monitor</h2>
                        <p className="text-sm text-slate-500">Real-time status of student submissions</p>
                    </div>
                    <div className="flex gap-2">
                        <div className="text-right px-4">
                            <div className="text-2xl font-bold text-slate-800">
                                {groups.reduce((acc, g) => {
                                    const compositeKey = `${rubric.id}_${g.id}`;
                                    return acc + (assessments[compositeKey]?.peerEvaluations?.length || 0)
                                }, 0)}
                            </div>
                            <div className="text-xs text-slate-500 uppercase font-bold">Total Reviews</div>
                        </div>
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white text-slate-500 border-b border-slate-100">
                            <tr>
                                <th className="p-4 font-bold">Group</th>
                                <th className="p-4 font-bold">Student Name</th>
                                <th className="p-4 font-bold">Status</th>
                                <th className="p-4 font-bold text-right">Avg Score Received</th>
                                <th className="p-4 font-bold text-right">Reviews Given</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groups.map(group => {
                                const compositeKey = `${rubric.id}_${group.id}`;
                                const assessment = assessments[compositeKey];
                                const members = group.members || [];
                                
                                return members.map(member => {
                                    // Calculate stats for this member
                                    const reviewsGiven = assessment?.peerEvaluations?.filter(e => e.evaluator === member) || [];
                                    const hasSubmitted = reviewsGiven.length > 0;
                                    
                                    const reviewsReceived = assessment?.peerEvaluations?.filter(e => e.subject === member) || [];
                                    const avgScore = reviewsReceived.length > 0 
                                        ? Math.round(reviewsReceived.reduce((sum, r) => sum + r.score, 0) / reviewsReceived.length)
                                        : 0;

                                    return (
                                        <tr key={`${group.id}-${member}`} className="hover:bg-slate-50">
                                            <td className="p-4 text-slate-500">{group.name}</td>
                                            <td className="p-4 font-medium text-slate-800">{member}</td>
                                            <td className="p-4">
                                                {hasSubmitted ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                                        Submitted
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                        Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                {reviewsReceived.length > 0 ? (
                                                    <span className={`font-mono font-bold ${avgScore < 60 ? 'text-red-500' : 'text-blue-600'}`}>
                                                        {avgScore}%
                                                    </span>
                                                ) : <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="p-4 text-right text-slate-600">
                                                {reviewsGiven.length} / {members.length - 1}
                                            </td>
                                        </tr>
                                    );
                                });
                            })}
                        </tbody>
                    </table>
                </div>
             </div>
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col animate-fade-in font-sans">
      
      {/* Header with Toggle */}
      <div className="bg-white border-b border-slate-200 p-4 shadow-sm flex justify-between items-center sticky top-0 z-10">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white">
                        <Icon.Users />
                    </div>
                    <h1 className="font-bold text-slate-800 text-lg hidden sm:block">Peer Eval</h1>
                </div>
                
                {/* Mode Switcher - Only visible if not in Guest Mode */}
                {!isGuest && step === 'KIOSK_START' && (
                    <div className="bg-slate-100 p-1 rounded-lg flex items-center">
                        <button 
                            onClick={() => setMode('STUDENT_MODE')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'STUDENT_MODE' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Student Mode (QR)
                        </button>
                        <button 
                            onClick={() => setMode('TEACHER_MODE')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'TEACHER_MODE' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Teacher Mode (Live)
                        </button>
                    </div>
                )}
            </div>
            <button onClick={() => step === 'KIOSK_START' && !isGuest ? onExit() : reset()} className="text-sm text-slate-500 hover:text-red-600 font-medium px-2">
             {(step === 'KIOSK_START' && !isGuest) ? 'Exit App' : (isGuest ? 'Reset' : 'Cancel Session')}
            </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        
        {/* TEACHER MODE: Live Monitor */}
        {mode === 'TEACHER_MODE' && step === 'KIOSK_START' && (
            <TeacherMonitor />
        )}

        {/* STUDENT MODE: QR Landing (Teacher View) */}
        {!isGuest && mode === 'STUDENT_MODE' && step === 'KIOSK_START' && (
            <div className="bg-white p-12 rounded-3xl shadow-xl border border-slate-200 text-center max-w-lg w-full relative overflow-hidden animate-fade-in">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-slate-800 mb-2">Join Peer Evaluation</h2>
                    <p className="text-slate-500">Scan the QR code to verify ID and start.</p>
                </div>
                
                <div className="bg-slate-50 p-6 rounded-2xl inline-block mb-8 border border-slate-100 relative">
                    <img src={qrUrl} alt="Scan to Evaluate" className="w-56 h-56 mix-blend-multiply" />
                </div>
                
                <p className="text-xs text-slate-400 mb-6 max-w-xs mx-auto">
                    Students can scan this code with their phones to access the evaluation form directly without logging in.
                </p>

                <button 
                    onClick={startStudentMode}
                    className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                    Test on this Device
                </button>
            </div>
        )}

        {/* ACTIVE STUDENT SESSION (Common for both if started) */}
        {step === 'SEARCH' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center space-y-6 max-w-md w-full animate-fade-in">
             <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                 <Icon.Users />
             </div>
             <div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Peer Evaluation Login</h2>
                <p className="text-slate-500">Please enter your Student ID to continue.</p>
             </div>
             
             <div className="space-y-4">
                 <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Enter Student ID"
                    className="w-full text-center text-lg p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                    autoFocus
                 />
                 {searchError && (
                     <p className="text-red-500 text-sm font-medium animate-pulse">{searchError}</p>
                 )}
                 <button 
                    onClick={handleSearch}
                    className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
                 >
                    Verify & Login
                 </button>
             </div>
          </div>
        )}

        {step === 'SELECT_SELF' && selectedGroup && (
           <div className="w-full max-w-lg space-y-6 animate-fade-in">
              <div className="text-center">
                  <h2 className="text-3xl font-bold text-slate-800 mb-1">{selectedGroup.name}</h2>
                  <p className="text-slate-500">Verify your identity to proceed.</p>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Enter your Name or ID</label>
                  <input 
                    type="text"
                    value={verificationQuery}
                    onChange={(e) => setVerificationQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerification()}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none mb-4"
                    placeholder="e.g. John Doe or S101"
                    autoFocus
                  />
                  {verificationError && (
                    <p className="text-red-500 text-sm mb-4">{verificationError}</p>
                  )}
                  <button 
                    onClick={handleVerification}
                    className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition-colors"
                  >
                    Continue to Evaluation
                  </button>
              </div>

              <button onClick={() => setStep('SEARCH')} className="w-full text-slate-400 hover:text-slate-600 text-sm">
                Back to Search
              </button>
           </div>
        )}

        {step === 'EVALUATE' && (
          <div className="w-full max-w-2xl space-y-6 pb-20 animate-fade-in">
             <div className="bg-purple-600 text-white p-6 rounded-2xl shadow-lg mb-8">
                <h2 className="text-2xl font-bold mb-1">{rubric.title}</h2>
                <p className="opacity-80 text-sm mb-4 line-clamp-2">{rubric.description}</p>
                <div className="flex items-center gap-2 text-sm font-medium bg-white/20 px-3 py-1 rounded-lg w-fit">
                    <span className="opacity-80">Evaluating Group:</span>
                    <span className="font-bold text-white">{selectedGroup?.name}</span>
                </div>
             </div>

             <div className="space-y-8">
                {Object.keys(evalForms).length === 0 && <p className="text-center text-slate-500">No teammates to evaluate.</p>}
                
                {Object.keys(evalForms).map((teammate, idx) => (
                   <div key={teammate} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                         <h3 className="font-bold text-xl text-slate-800">{teammate}</h3>
                         <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded uppercase">Member {idx + 1}</span>
                      </div>
                      
                      <div className="space-y-8">
                         {/* Question 1 */}
                         <div>
                            <label className="block text-sm font-bold text-slate-700 mb-3">
                                1. How significant was their contribution to "{rubric.title}"?
                            </label>
                            {renderRatingInput(
                                evalForms[teammate].q1,
                                (val) => handleFormChange(teammate, 'q1', val),
                                'bg-purple-600 border-purple-600'
                            )}
                         </div>

                         {/* Question 2 */}
                         <div>
                            <label className="block text-sm font-bold text-slate-700 mb-3">
                                2. Did they communicate and collaborate effectively?
                            </label>
                            {renderRatingInput(
                                evalForms[teammate].q2,
                                (val) => handleFormChange(teammate, 'q2', val),
                                'bg-blue-600 border-blue-600'
                            )}
                         </div>

                         {/* Question 3 */}
                         <div>
                            <label className="block text-sm font-bold text-slate-700 mb-3">
                                3. Did they meet deadlines and requirements?
                            </label>
                            {renderRatingInput(
                                evalForms[teammate].q3,
                                (val) => handleFormChange(teammate, 'q3', val),
                                'bg-green-600 border-green-600'
                            )}
                         </div>

                         {/* Question 4 (New) */}
                         <div>
                            <label className="block text-sm font-bold text-slate-700 mb-3">
                                4. How was the quality of their work output?
                            </label>
                            {renderRatingInput(
                                evalForms[teammate].q4,
                                (val) => handleFormChange(teammate, 'q4', val),
                                'bg-orange-600 border-orange-600'
                            )}
                         </div>

                         {/* Question 5 (New) */}
                         <div>
                            <label className="block text-sm font-bold text-slate-700 mb-3">
                                5. Did they show initiative and problem-solving skills?
                            </label>
                            {renderRatingInput(
                                evalForms[teammate].q5,
                                (val) => handleFormChange(teammate, 'q5', val),
                                'bg-rose-600 border-rose-600'
                            )}
                         </div>
                         
                         <div className="pt-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Private Feedback (Optional)</label>
                            <textarea 
                              value={evalForms[teammate].feedback}
                              onChange={(e) => handleFormChange(teammate, 'feedback', e.target.value)}
                              className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none h-20"
                              placeholder={`Comments for the teacher about ${teammate}...`}
                            />
                         </div>
                      </div>
                   </div>
                ))}
             </div>

             <div className="flex gap-4 pt-4 sticky bottom-4">
                <button onClick={() => setStep('SEARCH')} className="px-6 py-3 bg-white border border-slate-300 rounded-xl text-slate-600 font-bold hover:bg-slate-50 shadow-sm">
                   Cancel
                </button>
                <button 
                  onClick={handleSubmit}
                  className="flex-1 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg transition-all transform active:scale-95"
                >
                   Submit All Evaluations
                </button>
             </div>
          </div>
        )}

        {step === 'SUCCESS' && (
           <div className="text-center py-12 animate-fade-in bg-white rounded-3xl shadow-xl border border-slate-200 p-8 max-w-md w-full">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                 <Icon.Check />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Evaluation Submitted</h2>
              <p className="text-slate-500 mb-8">Thank you, <strong>{currentUser}</strong>. Your feedback has been recorded.</p>
              
              <button 
                onClick={reset}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
              >
                Done
              </button>
           </div>
        )}
      </div>
    </div>
  );
};