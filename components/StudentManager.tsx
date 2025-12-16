import React, { useState, useRef } from 'react';
import { Assignee } from '../types';
import { Icon } from './Icon';

interface StudentManagerProps {
  assignees: Assignee[];
  setAssignees: (list: Assignee[]) => void;
  assignmentType: 'individual' | 'group';
  readOnly?: boolean;
}

interface GroupModalState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  targetGroupId: string | null; // If editing
  groupName: string;
  members: { id: string; name: string }[];
}

interface StudentModalState {
    isOpen: boolean;
    id: string;
    name: string;
}

export const StudentManager: React.FC<StudentManagerProps> = ({ assignees, setAssignees, assignmentType, readOnly = false }) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'import'>('roster');
  const [inputText, setInputText] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ successCount: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter assignees based on the assignment type
  const displayAssignees = assignees.filter(a => a.type === assignmentType);

  // Group Modal State
  const [groupModal, setGroupModal] = useState<GroupModalState>({
    isOpen: false,
    mode: 'create',
    targetGroupId: null,
    groupName: '',
    members: []
  });

  // Student Modal State
  const [studentModal, setStudentModal] = useState<StudentModalState>({
      isOpen: false,
      id: '',
      name: ''
  });

  // Helper to ensure IDs are unique
  const generateUniqueId = (baseId: string, usedIds: Set<string>): string => {
    let uniqueId = baseId;
    let counter = 1;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${baseId}-${counter}`;
      counter++;
    }
    return uniqueId;
  };

  // Helper to parse member string "ID, Name" or just "Name"
  const parseMemberString = (m: string) => {
    if (m.includes(',')) {
        const parts = m.split(',');
        return { id: parts[0].trim(), name: parts.slice(1).join(',').trim() };
    }
    return { id: '', name: m.trim() };
  };

  const cleanField = (s: string) => s ? s.replace(/^["']|["']$/g, '').trim() : '';

  // --- Bulk Import Logic ---
  const processAndAdd = (text: string) => {
    if (readOnly) return;
    setImportFeedback(null);

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) {
        setImportFeedback({ successCount: 0, errors: ["File appears to be empty."]});
        return;
    }

    const newAssignees: Assignee[] = [];
    const errors: string[] = [];
    const usedIds = new Set<string>(assignees.map(a => a.id));
    
    // Aggregation for groups (Group Name -> {id, members[]})
    const pendingGroups = new Map<string, { id: string, name: string, members: string[] }>();

    // Header Detection
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('id') || firstLine.includes('name') || firstLine.includes('group');
    let startIndex = 0;
    
    // Default Column Mapping
    let colMap = { 
        id: 0, name: 1, // Individual: ID, Name
        groupId: 0, groupName: 1, memberId: 2, memberName: 3 // Group: GID, GName, MID, MName
    };

    if (hasHeader) {
        startIndex = 1;
        const headers = lines[0].split(',').map(h => cleanField(h).toLowerCase());
        
        if (assignmentType === 'individual') {
            colMap.id = headers.findIndex(h => h.includes('id') && !h.includes('group'));
            colMap.name = headers.findIndex(h => h.includes('name') && !h.includes('group'));
            // Fallback if not found
            if (colMap.id === -1) colMap.id = 0;
            if (colMap.name === -1) colMap.name = 1;
        } else {
            colMap.groupId = headers.findIndex(h => h === 'group id' || h === 'group_id' || h === 'gid');
            colMap.groupName = headers.findIndex(h => h.includes('group') && h.includes('name'));
            colMap.memberId = headers.findIndex(h => h.includes('student id') || h.includes('member id'));
            colMap.memberName = headers.findIndex(h => h.includes('student name') || h.includes('member name'));
            
            // If explicit group columns not found, try generic positions for Group CSVs
            if (colMap.groupName === -1) colMap.groupName = 0;
            if (colMap.memberName === -1) colMap.memberName = 1;
        }
    }

    // Process Lines
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // 1. Check for Custom Group Format (Group: Member; Member) - High Priority Override for existing text behavior
        if (assignmentType === 'group' && line.includes(':')) {
            try {
                const [groupPart, membersPart] = line.split(':');
                let gId = '';
                let gName = cleanField(groupPart);
                
                // Check if Group part has ID (ID, Name)
                if (gName.includes(',')) {
                    const parts = gName.split(',');
                    gId = cleanField(parts[0]);
                    gName = cleanField(parts.slice(1).join(','));
                }
                if (!gId) gId = crypto.randomUUID();

                // Members
                const memberStrings = membersPart ? membersPart.split(';').map(m => cleanField(m)).filter(m => m) : [];
                // If comma separated instead of semicolon, and no explicit IDs (simple list)
                let finalMembers = memberStrings;
                if (membersPart && !membersPart.includes(';') && membersPart.includes(',')) {
                     // CAUTION: This assumes Names only if comma separated.
                     finalMembers = membersPart.split(',').map(m => cleanField(m));
                }

                newAssignees.push({
                    id: gId,
                    name: gName,
                    type: 'group',
                    members: finalMembers
                });
            } catch (err) {
                errors.push(`Line ${i + 1}: Failed to parse custom group format.`);
            }
            continue;
        }

        // 2. CSV Processing
        const cols = line.split(',').map(cleanField);
        
        if (assignmentType === 'individual') {
            let id = cols[colMap.id] || '';
            let name = cols[colMap.name] || '';

            // Heuristic: If only 1 column, assume it's Name
            if (cols.length === 1 && !id) {
                name = cols[0];
            }

            if (!name) {
                errors.push(`Line ${i + 1}: Skipped (Missing Name)`);
                continue;
            }
            if (!id) id = crypto.randomUUID();

            if (usedIds.has(id)) {
                id = generateUniqueId(id, usedIds);
                errors.push(`Line ${i + 1}: Duplicate ID detected. Assigned new ID: ${id}`);
            }
            usedIds.add(id);
            newAssignees.push({ id, name, type: 'individual' });

        } else {
            // Group Flat CSV (Aggregation)
            // Expect: GroupName, [MemberName]...
            let gName = cols[colMap.groupName];
            let gId = cols[colMap.groupId] || '';
            let mName = cols[colMap.memberName];
            let mId = cols[colMap.memberId] || '';

            // Fallback for simple "Group, Member" format
            if (!hasHeader && cols.length >= 2) {
                 gName = cols[0];
                 mName = cols[1];
            }

            if (!gName) {
                errors.push(`Line ${i + 1}: Skipped (Missing Group Name)`);
                continue;
            }

            const groupKey = gId ? gId : gName;
            
            if (!pendingGroups.has(groupKey)) {
                if (!gId) gId = crypto.randomUUID();
                pendingGroups.set(groupKey, { id: gId, name: gName, members: [] });
            }

            if (mName) {
                const memberStr = mId ? `${mId}, ${mName}` : mName;
                pendingGroups.get(groupKey)?.members.push(memberStr);
            }
        }
    }

    // Finalize aggregated groups
    if (assignmentType === 'group') {
        pendingGroups.forEach(g => {
            newAssignees.push({
                id: g.id,
                name: g.name,
                type: 'group',
                members: g.members
            });
        });
    }

    if (newAssignees.length > 0) {
        setAssignees([...assignees, ...newAssignees]);
        // Don't clear input text immediately so user can see what they pasted if there are errors, 
        // but typically we clear on success. Let's keep input if there are errors? 
        // For now, clear if success > 0 to indicate progress.
        setInputText('');
    }

    setImportFeedback({
        successCount: newAssignees.length,
        errors
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      processAndAdd(event.target?.result as string);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // --- CRUD Operations ---
  const removeAssignee = (id: string) => {
    if (readOnly) return;
    if (confirm('Are you sure you want to remove this? Grades will be lost.')) {
        setAssignees(assignees.filter(a => a.id !== id));
    }
  };

  const removeMemberFromGroup = (groupId: string, memberIndex: number) => {
    if (readOnly) return;
    const group = assignees.find(a => a.id === groupId);
    if (!group || !group.members) return;

    const newMembers = [...group.members];
    newMembers.splice(memberIndex, 1);
    
    setAssignees(assignees.map(a => a.id === groupId ? { ...a, members: newMembers } : a));
  };

  // --- Student Modal Logic ---
  const openAddStudentModal = () => {
      if (readOnly) return;
      setStudentModal({ isOpen: true, id: '', name: '' });
  };

  const saveStudent = () => {
      if (!studentModal.name.trim()) {
          alert("Name is required");
          return;
      }
      
      let finalId = studentModal.id.trim();
      if (!finalId) {
          finalId = crypto.randomUUID().slice(0, 8).toUpperCase();
      }

      if (assignees.some(a => a.id === finalId)) {
          alert("Student ID already exists. Please use a unique ID.");
          return;
      }

      const newStudent: Assignee = {
          id: finalId,
          name: studentModal.name.trim(),
          type: 'individual'
      };

      setAssignees([...assignees, newStudent]);
      setStudentModal({ isOpen: false, id: '', name: '' });
  };


  // --- Group Modal Logic ---
  const openCreateGroupModal = () => {
    if (readOnly) return;
    setGroupModal({
        isOpen: true,
        mode: 'create',
        targetGroupId: null,
        groupName: '',
        members: [{ id: '', name: '' }, { id: '', name: '' }] // Start with 2 empty slots
    });
  };

  const openAddMemberModal = (groupId: string) => {
    if (readOnly) return;
    const group = assignees.find(a => a.id === groupId);
    if (!group) return;

    const parsedMembers = (group.members || []).map(parseMemberString);

    setGroupModal({
        isOpen: true,
        mode: 'edit',
        targetGroupId: groupId,
        groupName: group.name,
        members: parsedMembers
    });
  };

  const handleModalMemberChange = (index: number, field: 'id' | 'name', value: string) => {
    const newMembers = [...groupModal.members];
    newMembers[index] = { ...newMembers[index], [field]: value };
    setGroupModal({ ...groupModal, members: newMembers });
  };

  const addModalMemberRow = () => {
    setGroupModal({
        ...groupModal,
        members: [...groupModal.members, { id: '', name: '' }]
    });
  };

  const removeModalMemberRow = (index: number) => {
    const newMembers = [...groupModal.members];
    newMembers.splice(index, 1);
    setGroupModal({ ...groupModal, members: newMembers });
  };

  const saveGroupModal = () => {
    const { groupName, members, mode, targetGroupId } = groupModal;
    
    if (!groupName.trim()) {
        alert("Group Name is required");
        return;
    }

    // Filter out empty members
    const validMembers = members
        .filter(m => m.name.trim() !== '')
        .map(m => m.id.trim() ? `${m.id.trim()}, ${m.name.trim()}` : m.name.trim());

    if (mode === 'create') {
        const finalId = crypto.randomUUID();
        
        const newGroup: Assignee = {
            id: finalId,
            name: groupName.trim(),
            type: 'group',
            members: validMembers
        };
        setAssignees([...assignees, newGroup]);

    } else if (mode === 'edit' && targetGroupId) {
        setAssignees(assignees.map(a => {
            if (a.id === targetGroupId) {
                return {
                    ...a,
                    name: groupName.trim(),
                    members: validMembers
                };
            }
            return a;
        }));
    }

    setGroupModal({ ...groupModal, isOpen: false });
  };


  return (
    <div className="h-full flex flex-col animate-fade-in space-y-4">
      
      {/* Top Controls */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
         <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">
                {assignmentType === 'group' ? 'Group List' : 'Student List'}
            </h2>
            {!readOnly && (
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                    onClick={() => setActiveTab('roster')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'roster' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    View Roster
                </button>
                <button 
                    onClick={() => setActiveTab('import')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'import' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Bulk Import
                </button>
            </div>
            )}
         </div>
         {!readOnly && (
         <div className="flex gap-3">
             {assignmentType === 'individual' && (
                 <button 
                    onClick={openAddStudentModal}
                    className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2 text-sm"
                 >
                    <Icon.Plus /> Add Student
                 </button>
             )}
             {assignmentType === 'group' && (
                 <button 
                    onClick={openCreateGroupModal}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 flex items-center gap-2 text-sm shadow-sm"
                 >
                    <Icon.Plus /> Create Group
                 </button>
             )}
         </div>
         )}
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
         
         {!readOnly && activeTab === 'import' && (
             <div className="p-6 max-w-3xl mx-auto w-full overflow-y-auto">
                <h3 className="font-bold text-lg mb-2">Bulk Import</h3>
                <p className="text-sm text-slate-500 mb-4">
                    Paste data below or upload a CSV. The system will auto-detect headers (ID, Name, Group).
                    <br/>
                    {assignmentType === 'group' ? (
                        <>Format: <code>Group, Member Name</code> (One row per member) OR <code>Group: Member1; Member2</code></>
                    ) : (
                        <>Format: <code>ID, Name</code> or <code>Name, ID</code> or just <code>Name</code></>
                    )}
                </p>
                <textarea
                    className="w-full h-48 border border-slate-300 rounded-lg p-4 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-4"
                    placeholder={assignmentType === 'group' ? "Group Alpha, S101, John\nGroup Alpha, S102, Jane" : "S101, John Doe\nS102, Jane Smith"}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                />
                
                {importFeedback && (
                    <div className="mb-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                        <div className="font-bold text-slate-700 mb-2">Import Results:</div>
                        <p className="text-green-600 font-medium mb-2">✅ {importFeedback.successCount} items imported successfully.</p>
                        {importFeedback.errors.length > 0 && (
                            <div className="mt-2 text-red-600">
                                <p className="font-bold">Errors ({importFeedback.errors.length}):</p>
                                <ul className="list-disc pl-5 max-h-32 overflow-y-auto">
                                    {importFeedback.errors.map((err, i) => <li key={i}>{err}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-3">
                    <button 
                        onClick={() => processAndAdd(inputText)}
                        disabled={!inputText.trim()}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                        Import Data
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-6 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                    >
                        Upload CSV
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleFileUpload} />
                </div>
             </div>
         )}

         {activeTab === 'roster' && (
            <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-3 font-bold">Group Name</th>
                            <th className="px-6 py-3 font-bold">Student ID</th>
                            <th className="px-6 py-3 font-bold">Name</th>
                            {!readOnly && <th className="px-6 py-3 font-bold text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {displayAssignees.length === 0 && (
                            <tr>
                                <td colSpan={readOnly ? 3 : 4} className="p-12 text-center text-slate-400">
                                    No {assignmentType}s found.
                                </td>
                            </tr>
                        )}
                        {displayAssignees.map(a => (
                            <React.Fragment key={a.id}>
                                {a.type === 'individual' ? (
                                    <tr className="hover:bg-slate-50">
                                        <td className="px-6 py-3 text-slate-300">-</td>
                                        <td className="px-6 py-3 font-mono text-slate-600">{a.id}</td>
                                        <td className="px-6 py-3 font-medium text-slate-800">{a.name}</td>
                                        {!readOnly && (
                                        <td className="px-6 py-3 text-right">
                                            <button 
                                                onClick={() => removeAssignee(a.id)} 
                                                className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50"
                                            >
                                                <Icon.Trash />
                                            </button>
                                        </td>
                                        )}
                                    </tr>
                                ) : (
                                    <>
                                        {/* Group Header */}
                                        <tr className="bg-purple-50/50 hover:bg-purple-50 border-b border-purple-100">
                                            <td className="px-6 py-3 font-bold text-purple-700 flex items-center gap-2">
                                                <Icon.Users /> {a.name}
                                            </td>
                                            <td className="px-6 py-3 font-mono text-purple-600 font-bold">{a.id}</td>
                                            <td className="px-6 py-3 text-purple-400 italic text-xs uppercase tracking-wider">Group Entity</td>
                                            {!readOnly && (
                                            <td className="px-6 py-3 text-right flex justify-end gap-2">
                                                <button 
                                                    onClick={() => openAddMemberModal(a.id)}
                                                    className="bg-white border border-purple-200 text-purple-600 hover:bg-purple-100 px-2 py-1 rounded text-xs font-bold flex items-center gap-1"
                                                >
                                                    <Icon.Plus /> Manage Members
                                                </button>
                                                <button 
                                                    onClick={() => removeAssignee(a.id)} 
                                                    className="text-purple-300 hover:text-red-500 p-1 rounded hover:bg-red-50"
                                                >
                                                    <Icon.Trash />
                                                </button>
                                            </td>
                                            )}
                                        </tr>
                                        {/* Group Members */}
                                        {a.members?.map((m, idx) => {
                                            const { id, name } = parseMemberString(m);
                                            return (
                                                <tr key={`${a.id}-m-${idx}`} className="hover:bg-slate-50">
                                                    <td className="px-6 py-2 text-slate-300 text-right pr-4 border-r border-slate-100 bg-slate-50/30 w-48">
                                                       
                                                    </td>
                                                    <td className="px-6 py-2 font-mono text-slate-500 text-xs">{id || '-'}</td>
                                                    <td className="px-6 py-2 text-slate-700">{name}</td>
                                                    {!readOnly && (
                                                    <td className="px-6 py-2 text-right">
                                                        <button 
                                                            onClick={() => removeMemberFromGroup(a.id, idx)}
                                                            className="text-slate-300 hover:text-red-500 opacity-50 hover:opacity-100"
                                                            title="Remove Member"
                                                        >
                                                            <Icon.XMark />
                                                        </button>
                                                    </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                        {(!a.members || a.members.length === 0) && (
                                            <tr>
                                                <td colSpan={readOnly ? 3 : 4} className="px-6 py-2 text-xs text-orange-400 italic bg-orange-50/30 pl-20">
                                                    No members in this group.
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
         )}
      </div>

      {/* Student Modal */}
      {!readOnly && studentModal.isOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-lg text-slate-800">Add Student</h3>
                      <button onClick={() => setStudentModal({...studentModal, isOpen: false})} className="text-slate-400 hover:text-slate-600">
                          <Icon.XMark />
                      </button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Student ID</label>
                          <input 
                              value={studentModal.id}
                              onChange={(e) => setStudentModal({...studentModal, id: e.target.value})}
                              className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                              placeholder="e.g. S1024"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
                          <input 
                              value={studentModal.name}
                              onChange={(e) => setStudentModal({...studentModal, name: e.target.value})}
                              className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="e.g. John Doe"
                          />
                      </div>
                      <button 
                          onClick={saveStudent}
                          className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 mt-4"
                      >
                          Add to List
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Group Modal */}
      {!readOnly && groupModal.isOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                      <h3 className="font-bold text-lg text-slate-800">
                          {groupModal.mode === 'create' ? 'Create New Group' : 'Manage Group Members'}
                      </h3>
                      <button onClick={() => setGroupModal({ ...groupModal, isOpen: false })} className="text-slate-400 hover:text-slate-600">
                          <Icon.XMark />
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto space-y-6">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Group Name</label>
                          <input 
                              value={groupModal.groupName}
                              onChange={(e) => setGroupModal({...groupModal, groupName: e.target.value})}
                              className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="e.g. Team Alpha"
                          />
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">Members</label>
                          <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase">
                                      <tr>
                                          <th className="px-4 py-2">Student ID</th>
                                          <th className="px-4 py-2">Name</th>
                                          <th className="px-4 py-2 w-10"></th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {groupModal.members.map((m, i) => (
                                          <tr key={i} className="bg-white">
                                              <td className="p-2">
                                                  <input 
                                                      value={m.id}
                                                      onChange={(e) => handleModalMemberChange(i, 'id', e.target.value)}
                                                      className="w-full border border-slate-200 rounded px-2 py-1 focus:border-blue-500 outline-none font-mono text-xs"
                                                      placeholder="ID (e.g. S101)"
                                                  />
                                              </td>
                                              <td className="p-2">
                                                  <input 
                                                      value={m.name}
                                                      onChange={(e) => handleModalMemberChange(i, 'name', e.target.value)}
                                                      className="w-full border border-slate-200 rounded px-2 py-1 focus:border-blue-500 outline-none"
                                                      placeholder="Student Name"
                                                  />
                                              </td>
                                              <td className="p-2 text-center">
                                                  <button onClick={() => removeModalMemberRow(i)} className="text-red-400 hover:text-red-600">
                                                      <Icon.XMark />
                                                  </button>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                              <button 
                                  onClick={addModalMemberRow}
                                  className="w-full py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 transition-colors border-t border-slate-200"
                              >
                                  + Add Member Row
                              </button>
                          </div>
                      </div>
                  </div>

                  <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-3">
                      <button 
                          onClick={() => setGroupModal({ ...groupModal, isOpen: false })}
                          className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={saveGroupModal}
                          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200"
                      >
                          Save Group
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};