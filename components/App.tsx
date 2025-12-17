import React, { useState, useEffect } from 'react';
import { AppView, Rubric, Assignee, Assessment, UserRole } from '../types';
import { RubricEditor } from './RubricEditor';
import { SubjectAssignment } from './SubjectAssignment';
import { StudentManager } from './StudentManager';
import { Grader } from './Grader';
import { ExportView } from './ExportView';
import { StudentPeerEval } from './StudentPeerEval';
import { Login } from './Login';
import { Icon } from './Icon';

const INITIAL_RUBRIC: Rubric = {
  id: 'default',
  title: 'Assignment 1',
  subject: '',
  description: 'General assessment rubric',
  criteria: [],
  passingPercentage: 50,
  assignmentWeight: 100,
  peerEvalWeight: 0,
  type: 'individual'
};

function App() {
  // Check URL params for Student Mode
  // We use a robust check for 'mode' parameter
  const getUrlParams = () => new URLSearchParams(window.location.search);
  const urlParams = getUrlParams();
  const modeParam = urlParams.get('mode');
  const isStudentMode = modeParam?.toLowerCase() === 'student';
  const paramTeacherId = urlParams.get('tId');
  const paramRubricId = urlParams.get('rId');

  // Initialize role based on URL to bypass login if student
  const [userRole, setUserRole] = useState<UserRole | null>(isStudentMode ? 'STUDENT' : null);
  const [userName, setUserName] = useState<string>(isStudentMode ? 'Student Guest' : '');
  const [userId, setUserId] = useState<string>(isStudentMode ? (paramTeacherId || 'guest') : ''); 

  // If student mode, default to PEER_KIOSK view
  const [currentView, setCurrentView] = useState<AppView>(isStudentMode ? AppView.PEER_KIOSK : AppView.DASHBOARD);
  
  // State Initialization
  const [rubrics, setRubrics] = useState<Rubric[]>([INITIAL_RUBRIC]);
  const [currentRubricId, setCurrentRubricId] = useState<string>(paramRubricId || INITIAL_RUBRIC.id);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assessments, setAssessments] = useState<Record<string, Assessment>>({});

  const rubric = rubrics.find(r => r.id === currentRubricId) || INITIAL_RUBRIC;

  // Effect to reinforce student mode if URL params are present (handles potential mounting race conditions)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'student' && userRole !== 'STUDENT') {
        setUserRole('STUDENT');
        setUserName('Student Guest');
        setUserId(params.get('tId') || 'guest');
        setCurrentView(AppView.PEER_KIOSK);
        if (params.get('rId')) setCurrentRubricId(params.get('rId')!);
    }
  }, [userRole]);
  
  // Load data logic:
  // 1. If Normal User: Load from their own storage key
  // 2. If Student Guest: Load from the TEACHER'S storage key (read-only mostly, but writes assessments)
  useEffect(() => {
    // Determine the key to load from
    let storageKey = '';
    
    // Refresh params to be sure
    const currentTId = isStudentMode ? paramTeacherId : null;
    
    if ((userRole === 'STUDENT' || isStudentMode) && currentTId) {
        // Load teacher's data for the student to view
        storageKey = `smartgrade_data_${currentTId}`;
    } else if (userId && !isStudentMode) {
        // Load own data (Teacher/Assessor)
        storageKey = `smartgrade_data_${userId}`;
    }

    if (storageKey) {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                setRubrics(parsed.rubrics || [INITIAL_RUBRIC]);
                setAssignees(parsed.assignees || []);
                setAssessments(parsed.assessments || {});
                
                // If specific rubric requested via URL, try to set it
                if (paramRubricId) {
                   // Verify it exists in loaded data
                   const exists = parsed.rubrics?.find((r: Rubric) => r.id === paramRubricId);
                   if (exists) {
                       setCurrentRubricId(paramRubricId);
                   } else {
                       setCurrentRubricId(parsed.currentRubricId || INITIAL_RUBRIC.id);
                   }
                } else {
                    setCurrentRubricId(parsed.currentRubricId || (parsed.rubrics ? parsed.rubrics[0].id : INITIAL_RUBRIC.id));
                }
            } catch (e) {
                console.error("Failed to load data", e);
            }
        }
    }
  }, [userRole, userId, paramTeacherId, paramRubricId, isStudentMode]);

  // Persist data whenever it changes
  useEffect(() => {
    // Only save if we have a valid user context
    if (userId) {
        // If student, we technically want to save back to teacher's key (Shared device/Simulated Backend)
        // OR save to a temp key if we don't want to overwrite teacher config.
        // For this demo to work (student submits -> teacher sees), we must write to teacher key.
        const targetId = ((userRole === 'STUDENT' || isStudentMode) && paramTeacherId) ? paramTeacherId : userId;
        const storageKey = `smartgrade_data_${targetId}`;
        
        const dataToSave = {
            rubrics,
            assignees,
            assessments,
            currentRubricId
        };
        localStorage.setItem(storageKey, JSON.stringify(dataToSave));
    }
  }, [rubrics, assignees, assessments, currentRubricId, userId, userRole, paramTeacherId, isStudentMode]);

  const handleLogin = (role: UserRole, label: string, email: string) => {
      setUserRole(role);
      setUserName(label);
      setUserId(email);

      // Explicit load on login
      const storageKey = `smartgrade_data_${email}`;
      const savedData = localStorage.getItem(storageKey);

      if (savedData) {
          try {
              const parsed = JSON.parse(savedData);
              setRubrics(parsed.rubrics || [INITIAL_RUBRIC]);
              setAssignees(parsed.assignees || []);
              setAssessments(parsed.assessments || {});
              setCurrentRubricId(parsed.currentRubricId || (parsed.rubrics ? parsed.rubrics[0].id : INITIAL_RUBRIC.id));
          } catch (e) {
              setRubrics([INITIAL_RUBRIC]);
          }
      } else {
          setRubrics([INITIAL_RUBRIC]);
          setAssignees([]);
          setAssessments({});
          setCurrentRubricId(INITIAL_RUBRIC.id);
      }

      if (role === 'ASSESSOR') {
          setCurrentView(AppView.GRADING);
      } else {
          setCurrentView(AppView.DASHBOARD);
      }
  };

  const handleLogout = () => {
      // Clear URL params to exit student mode cleanly
      window.history.pushState({}, '', window.location.pathname);
      
      setUserRole(null);
      setUserName('');
      setUserId('');
      setCurrentView(AppView.DASHBOARD);
      setRubrics([INITIAL_RUBRIC]);
      setAssignees([]);
      setAssessments({});
  };

  const handleDeleteAccount = () => {
      const confirmDelete = window.confirm(
          "Are you sure you want to permanently delete your account? This action cannot be undone and will delete all your rubrics, student lists, and grades."
      );

      if (confirmDelete) {
          const storageKey = `smartgrade_data_${userId}`;
          localStorage.removeItem(storageKey);

          if (userId.toLowerCase() !== 'admin') {
              const existingUsersStr = localStorage.getItem('smartgrade_users_db');
              if (existingUsersStr) {
                  const existingUsers = JSON.parse(existingUsersStr);
                  const updatedUsers = existingUsers.filter((u: any) => u.username !== userId);
                  localStorage.setItem('smartgrade_users_db', JSON.stringify(updatedUsers));
              }
          }
          handleLogout();
          alert("Account deleted successfully.");
      }
  };

  const handleUpdateRubric = (updated: Rubric) => {
      setRubrics(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const handleCreateRubric = () => {
      const newRubric: Rubric = {
          ...INITIAL_RUBRIC,
          id: crypto.randomUUID(),
          title: `Assignment ${rubrics.length + 1}`,
          subject: rubric.subject,
          plos: rubric.plos,
          clos: rubric.clos,
          type: 'individual'
      };
      setRubrics([...rubrics, newRubric]);
      setCurrentRubricId(newRubric.id);
  };

  const handleDeleteRubric = (id: string) => {
      if (rubrics.length <= 1) {
          alert("Cannot delete the last assignment.");
          return;
      }
      if (confirm("Are you sure? This will delete the assignment rubric and all associated grades.")) {
          const newRubrics = rubrics.filter(r => r.id !== id);
          setRubrics(newRubrics);
          if (currentRubricId === id) {
              setCurrentRubricId(newRubrics[0].id);
          }
      }
  };

  const handleDeleteSubject = (subjectKey: string) => {
      const rubricsInSubject = rubrics.filter(r => {
           const key = r.subject && r.subject.trim() ? r.subject.trim().toUpperCase() : 'NO SUBJECT';
           return key === subjectKey;
      });
      
      if (rubrics.length === rubricsInSubject.length) {
          alert("Cannot delete the only remaining course/subject. At least one assignment must exist in the system.");
          return;
      }
      
      if (confirm(`Are you sure you want to delete "${subjectKey}" and all ${rubricsInSubject.length} assignments inside it? This action cannot be undone.`)) {
          const idsToDelete = new Set(rubricsInSubject.map(r => r.id));
          const newRubrics = rubrics.filter(r => !idsToDelete.has(r.id));
          setRubrics(newRubrics);
          if (idsToDelete.has(currentRubricId)) {
             if (newRubrics.length > 0) {
                 setCurrentRubricId(newRubrics[0].id);
             }
          }
      }
  };

  const handleUpdateAssessment = (id: string, assessment: Assessment) => {
    setAssessments(prev => ({
      ...prev,
      [id]: assessment
    }));
  };

  const handleRubricClick = () => {
      if (!rubric.title.trim() || rubric.title === 'Untitled Assignment' || !rubric.subject) {
          setCurrentView(AppView.SUBJECT_ASSIGNMENT);
      } else {
          setCurrentView(AppView.RUBRIC_EDITOR);
      }
  };

  const handleExportData = () => {
    const data = {
        rubrics,
        assignees,
        assessments,
        currentRubricId,
        metadata: {
            version: '1.0',
            exportedBy: userName,
            exportedAt: new Date().toISOString()
        }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartgrade_backup_${userName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (!json.rubrics || !Array.isArray(json.rubrics)) {
                  alert("Invalid backup file format. Missing rubrics data.");
                  return;
              }
              if (confirm(`Restore data from ${json.metadata?.exportedAt ? new Date(json.metadata.exportedAt).toLocaleString() : 'unknown date'}? This will overwrite your current ${assignees.length} students and ${rubrics.length} assignments.`)) {
                  setRubrics(json.rubrics);
                  setAssignees(json.assignees || []);
                  setAssessments(json.assessments || {});
                  if (json.currentRubricId) setCurrentRubricId(json.currentRubricId);
                  alert("Data restored successfully.");
              }
          } catch (err) {
              console.error(err);
              alert("Failed to parse backup file.");
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };


  const NavButton = ({ view, label, icon, onClick }: { view?: AppView, label: string, icon: React.ReactNode, onClick?: () => void }) => {
    const isActive = currentView === view;
    return (
        <button
        onClick={onClick ? onClick : () => view && setCurrentView(view)}
        className={`flex items-center gap-2 md:gap-3 px-4 md:px-6 py-2 md:py-3 rounded-xl transition-all duration-200 whitespace-nowrap font-medium text-sm md:text-base ${
            isActive 
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
            : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-blue-600'
        }`}
        >
        {icon}
        <span>{label}</span>
        </button>
    );
  };

  const totalStudents = assignees.length;
  const gradedStudents = assignees.filter(a => assessments[`${rubric.id}_${a.id}`]).length;
  const progressPercentage = totalStudents > 0 ? (gradedStudents / totalStudents) * 100 : 0;

  // IMPORTANT: Direct failsafe for Student Mode
  // If params say student mode, render the student view regardless of state latency
  if (isStudentMode && !userRole) {
      return (
        <StudentPeerEval 
            assignees={assignees} 
            assessments={assessments} 
            rubric={rubric} 
            onSaveAssessment={handleUpdateAssessment}
            onExit={handleLogout}
            hostUserId={paramTeacherId || ''}
            isGuest={true}
        />
      );
  }

  // Render Login if not authenticated
  if (!userRole) {
      return <Login onLogin={handleLogin} />;
  }

  // Full Screen Student View
  if (currentView === AppView.PEER_KIOSK) {
    return (
      <StudentPeerEval 
        assignees={assignees} 
        assessments={assessments} 
        rubric={rubric} 
        onSaveAssessment={handleUpdateAssessment} 
        onExit={handleLogout} 
        hostUserId={userId} 
        isGuest={userRole === 'STUDENT'} 
      /> 
    ); 
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans text-slate-900">
      
      {/* Navigation Sidebar */}
      <nav className="bg-white border-b md:border-b-0 md:border-r border-slate-200 w-full md:w-64 flex-shrink-0 flex flex-col p-4 z-10">
        
        {/* Header: Logo & Mobile Profile Actions */}
        <div className="flex justify-between items-center mb-4 md:mb-8 px-2">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-sm flex items-center justify-center text-white">
                    <Icon.Logo className="w-5 h-5" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800">
                SmartGrade AI<span className="text-blue-600 text-sm align-top relative -top-0.5">+</span>
                </h1>
            </div>

            {/* Mobile Actions */}
            <div className="md:hidden flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs border border-slate-200">
                     {userName.charAt(0)}
                 </div>
                 <button onClick={handleLogout} className="text-slate-400 hover:text-red-500">
                    <Icon.XMark className="w-6 h-6" />
                 </button>
            </div>
        </div>
        
        {/* Navigation Items */}
        <div className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 scrollbar-hide">
          <NavButton view={AppView.DASHBOARD} label="Overview" icon={<Icon.DocumentText />} />
          
          {userRole === 'TEACHER' && (
             <NavButton view={AppView.SUBJECT_ASSIGNMENT} label="Subject" icon={<Icon.Pencil />} />
          )}
          
          <NavButton onClick={handleRubricClick} label="Rubric" icon={<Icon.Sparkles />} view={currentView === AppView.RUBRIC_EDITOR ? AppView.RUBRIC_EDITOR : undefined} />
          
          <NavButton view={AppView.ASSIGNEES} label="Student List" icon={<Icon.Users />} />

          <NavButton view={AppView.GRADING} label="Grade" icon={<Icon.Check />} />
          <NavButton view={AppView.EXPORT} label="Results" icon={<Icon.Download />} />
        </div>

        {/* Desktop Footer (Profile) */}
        <div className="hidden md:block mt-auto pt-8 px-4 border-t border-slate-100">
             <div className="flex items-center gap-3 mb-4">
                 <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                     {userName.charAt(0)}
                 </div>
                 <div className="overflow-hidden">
                     <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
                     <p className="text-xs text-slate-500 truncate">{userId}</p>
                 </div>
             </div>
             <div className="flex justify-between items-center">
                 <button 
                    onClick={handleLogout}
                    className="text-xs text-slate-500 font-medium hover:text-slate-800 hover:underline"
                 >
                     Sign Out
                 </button>
                 <button 
                    onClick={handleDeleteAccount}
                    className="text-xs text-red-400 font-medium hover:text-red-600 hover:underline"
                 >
                     Delete Account
                 </button>
             </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen">
        <div className="max-w-6xl mx-auto">
            {currentView === AppView.DASHBOARD && (
                <div className="animate-fade-in space-y-6">
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
                        <h2 className="text-3xl font-bold mb-2">Welcome, {userName}!</h2>
                        <p className="opacity-90 max-w-xl">
                            {rubric.subject ? `Managing assignment: ${rubric.title} (${rubric.subject})` : 'Select an option below to continue.'}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {userRole === 'TEACHER' && (
                             <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group" onClick={() => setCurrentView(AppView.SUBJECT_ASSIGNMENT)}>
                                <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-orange-600 group-hover:text-white transition-colors"><Icon.DocumentText /></div>
                                <h3 className="font-bold text-lg mb-1">Subject Assignment</h3>
                                {rubric.subject ? (
                                    <div className="text-sm">
                                        <p className="font-bold text-slate-700 truncate">{rubric.subject}</p>
                                        <p className="text-slate-500 truncate">{rubric.title}</p>
                                    </div>
                                ) : (
                                    <p className="text-slate-500 text-sm">Define subject, title, and weightages.</p>
                                )}
                            </div>
                        )}

                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={handleRubricClick}>
                            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4"><Icon.Sparkles /></div>
                            <h3 className="font-bold text-lg mb-1">{userRole === 'TEACHER' ? 'Rubric Setup' : 'View Rubric'}</h3>
                            <p className="text-slate-500 text-sm">{rubric.criteria.length > 0 ? `${rubric.criteria.length} Criteria defined` : (userRole === 'TEACHER' ? 'Create or generate rubrics' : 'No rubric defined')}</p>
                        </div>
                        
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setCurrentView(AppView.ASSIGNEES)}>
                            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-4"><Icon.Users /></div>
                            <h3 className="font-bold text-lg mb-1">Student List</h3>
                            <p className="text-slate-500 text-sm">{totalStudents} Students/Groups enrolled</p>
                        </div>

                         <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden" onClick={() => setCurrentView(AppView.GRADING)}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center"><Icon.Check /></div>
                                <span className="font-bold text-2xl text-slate-700">{Math.round(progressPercentage)}%</span>
                            </div>
                            <h3 className="font-bold text-lg mb-2">Grading Progress</h3>
                            
                            <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden">
                                <div 
                                    className="bg-green-500 h-2 rounded-full transition-all duration-1000 ease-out" 
                                    style={{ width: `${progressPercentage}%` }}
                                ></div>
                            </div>
                            <p className="text-slate-500 text-sm flex justify-between">
                                <span>{gradedStudents} / {totalStudents} Graded</span>
                            </p>
                        </div>
                        
                        {userRole === 'TEACHER' && (
                        <div className="md:col-span-2 lg:col-span-4 bg-white p-6 rounded-xl border border-purple-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group flex items-center justify-between" onClick={() => setCurrentView(AppView.PEER_KIOSK)}>
                            <div>
                                <h3 className="font-bold text-lg mb-1 text-purple-900">Peer Eval Mode</h3>
                                <p className="text-purple-600/70 text-sm">Launch full-screen student kiosk for group evaluations</p>
                            </div>
                            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors"><Icon.Users /></div>
                        </div>
                        )}
                    </div>
                    
                    {userRole === 'TEACHER' && (
                    <div className="mt-8 pt-8 border-t border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Icon.CloudArrowUp /> Data Management
                        </h3>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button 
                                onClick={handleExportData}
                                className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors"
                            >
                                <Icon.CloudArrowUp /> Backup Data (Export)
                            </button>
                            <label className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors cursor-pointer">
                                <Icon.Download /> Restore Data (Import)
                                <input type="file" className="hidden" accept=".json" onChange={handleImportData} />
                            </label>
                        </div>
                        <div className="mt-4 bg-yellow-50 text-yellow-800 text-xs p-3 rounded-lg border border-yellow-200 inline-block max-w-2xl">
                            <strong>Note:</strong> Since this app runs in your browser, your data is saved locally on this device. 
                            Use the buttons above to transfer your data when moving between devices or publishing to a new domain.
                        </div>
                    </div>
                    )}
                </div>
            )}

            {currentView === AppView.SUBJECT_ASSIGNMENT && userRole === 'TEACHER' && (
                <SubjectAssignment 
                    rubric={rubric}
                    allRubrics={rubrics}
                    onUpdate={handleUpdateRubric}
                    onSelectRubric={setCurrentRubricId}
                    onCreateRubric={handleCreateRubric}
                    onDeleteRubric={handleDeleteRubric}
                    onDeleteSubject={handleDeleteSubject}
                    onNext={() => setCurrentView(AppView.RUBRIC_EDITOR)}
                />
            )}

            {currentView === AppView.RUBRIC_EDITOR && (
                <RubricEditor 
                    rubric={rubric} 
                    onUpdate={handleUpdateRubric} 
                    readOnly={userRole === 'ASSESSOR'}
                />
            )}

            {currentView === AppView.ASSIGNEES && (
                <StudentManager 
                    assignees={assignees} 
                    setAssignees={setAssignees} 
                    assignmentType={rubric.type || 'individual'}
                    readOnly={userRole === 'ASSESSOR'}
                />
            )}

            {currentView === AppView.GRADING && (
                <Grader 
                    rubric={rubric} 
                    assignees={assignees} 
                    assessments={assessments} 
                    onSaveAssessment={handleUpdateAssessment} 
                />
            )}

            {currentView === AppView.EXPORT && (
                <ExportView assignees={assignees} assessments={assessments} rubric={rubric} rubrics={rubrics} />
            )}
        </div>
      </main>
    </div>
  );
}

export default App;