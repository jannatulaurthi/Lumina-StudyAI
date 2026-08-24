import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Trash2, 
  FileSearch, 
  Sparkles,
  ArrowRight,
  BookOpen,
  Upload,
  X,
  Loader2,
  Download,
  Dna,
  Moon
} from 'lucide-react';
import { useAuth } from './Auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  orderBy, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { askLumina } from '../lib/gemini';
import { cn, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { extractTextFromPdf } from '../lib/pdfUtils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const Notes: React.FC = () => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pdfContext, setPdfContext] = useState<string | null>(null);
  const noteContentRef = useRef<HTMLDivElement>(null);

  const fetchNotes = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'notes'), 
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [user]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Please upload a valid PDF study material.");
      return;
    }

    setIsExtracting(true);
    setFileName(file.name);
    try {
      const text = await extractTextFromPdf(file);
      if (!text.trim()) {
        alert("The PDF seems to have no readable text. It might be an image-only scan.");
        setIsExtracting(false);
        setFileName(null);
        return;
      }
      setPdfContext(text);
    } catch (err) {
      console.error("PDF Extraction failed", err);
      alert("Failed to extract text from PDF. Please check if the file is valid.");
    } finally {
      setIsExtracting(false);
    }
  };

  const clearFile = () => {
    setFileName(null);
    setPdfContext(null);
  };

  const handleSummarize = async () => {
    if (!pdfContext?.trim() || isSummarizing) return;
    
    setIsSummarizing(true);
    try {
      const prompt = `Please provide a thorough, highly organized, and visually appealing pedagogical summary of the following study material.
      Follow these requirements:
      1. **Structure**: Use clear sections with meaningful headings.
      2. **Formatting**: Use **bold** for key terms, *italics* for emphasis, and bullet points for lists. Use horizontal rules (---) to separate major sections.
      3. **Mathematical Formulas**: If there are any scientific or mathematical formulas, **always use LaTeX format** (e.g., $E=mc^2$ for inline or $$f(x) = x^2$$ for display). Ensure they are organized, clear, and easy to follow.
      4. **Visuals**: Use relevant emojis at the start of each section and within the text to represent concepts (e.g., 🧠 for concepts, 📝 for notes, 🚀 for takeaways, ⚖️ for comparisons, ❓ for practice).
      5. **Highlights**: Wrap essential formulas or core definitions in a blockquote for extra visibility.
      6. **Clarity**: Ensure the organization is "well neat" with high readability and a professional study-guide aesthetic.
      7. **Output**: Return the content in Markdown format.
      
      Sections to include:
      - 📌 **Key Concepts**: Atomic ideas and definitions.
      - 📖 **Detailed Narrative**: A cohesive summary of the core message.
      - ⚡ **Actionable Takeaways**: Practical steps or specific facts to remember.
      - 💡 **Study Insights**: Connections to related fields or simplified metaphors.
      - ❓ **Practice Questions**: Provide 3-5 thought-provoking questions to test understanding, including brief hints or expected logic where appropriate.
      
      MATERIAL: \n\n${pdfContext.substring(0, 15000)}`;
      
      console.log("Synthesizing summary for:", fileName, "Length:", pdfContext.length);
      const summary = await askLumina(prompt, [], 'general');
      
      if (!summary) {
        throw new Error("AI returned an empty summary.");
      }

      const title = `PDF: ${fileName?.replace('.pdf', '') || 'Extracted Note'}`;

      await addDoc(collection(db, 'notes'), {
        userId: user?.uid,
        title: title,
        content: summary,
        originalContent: pdfContext.substring(0, 5000),
        createdAt: serverTimestamp(),
        source: 'PDF Upload'
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'notes'));
      
      setPdfContext(null);
      setFileName(null);
      fetchNotes();
    } catch (e) {
      console.error("Summarization error:", e);
      alert("Apologies, I encountered an error while summarizing. Please try again or with a smaller PDF.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!selectedNote || isGeneratingQuiz) return;
    setIsGeneratingQuiz(true);
    try {
      const prompt = `Generate a high-quality study quiz with exactly 5 multiple choice questions BASED ON THIS CONTENT: ${selectedNote.content.substring(0, 15000)}. 
      Return the output as a valid JSON array of objects, where each object has:
      - question: the question text (Use LaTeX for any mathematical or scientific formulas, e.g., $E=mc^2$)
      - options: array of 4 strings (Use LaTeX for any formulas)
      - answer: the correct string from the options
      - explanation: a short explanation of the answer. (Use LaTeX for any formulas)
      Only return the JSON. No other text.`;
      
      const response = await askLumina(prompt, [], 'general');
      if (!response) throw new Error("AI returned empty response");

      const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const questionsList = JSON.parse(cleanJson);
      
      await addDoc(collection(db, 'quizzes'), {
        userId: user?.uid,
        topic: selectedNote.title.replace('PDF: ', ''),
        questions: questionsList,
        createdAt: serverTimestamp(),
        score: 0,
        isPdfGenerated: true,
        noteId: selectedNote.id
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'quizzes'));
      
      alert("Success! A new quiz has been generated in your Library based on this note.");
    } catch (e) {
      console.error("Quiz generation failed", e);
      alert("Failed to generate quiz. Please try again.");
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleExportPDF = async () => {
    if (!noteContentRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const element = noteContentRef.current;
      
      // html2canvas doesn't support oklch colors well (default in Tailwind v4)
      // We'll temporarily force some standard colors on the element for capture
      const originalStyle = element.getAttribute('style') || '';
      element.style.backgroundColor = '#ffffff';
      element.style.color = '#334155';
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#000000',
        onclone: (clonedDoc) => {
          // Force hex colors on common elements to avoid oklch parsing errors
          const nodes = clonedDoc.querySelectorAll('*');
          nodes.forEach((node) => {
            const el = node as HTMLElement;
            const style = window.getComputedStyle(el);
            if (style.color.includes('oklch')) el.style.color = '#FEFAE0';
            if (style.backgroundColor.includes('oklch')) {
              // If it's the main container's subtle bg, use hex equivalent
              if (el.className.includes('bg-indigo-50')) el.style.backgroundColor = '#2C1810';
              else el.style.backgroundColor = '#000000';
            }
            if (style.borderColor.includes('oklch')) el.style.borderColor = '#3D2B1F';
          });
        }
      });
      
      // Restore original style if any
      element.setAttribute('style', originalStyle);
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgProps = pdf.getImageProperties(imgData);
      const imgWidth = pdfWidth - 20; // 10mm margins
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      
      let heightLeft = imgHeight;
      let position = 10;
      
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - 20); // Accounting for margins
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - 20);
      }
      
      pdf.save(`${selectedNote.title.replace(/\s+/g, '_')}_Summary.pdf`);
    } catch (e) {
      console.error("PDF Export failed", e);
      alert("Failed to export PDF due to a rendering error. Try again shortly.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedNote || !confirm("Are you sure you want to erase this knowledge asset? This action is irreversible.")) return;
    
    try {
      await deleteDoc(doc(db, 'notes', selectedNote.id))
        .catch(err => handleFirestoreError(err, OperationType.DELETE, `notes/${selectedNote.id}`));
      
      setSelectedNote(null);
      fetchNotes();
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700 text-[#FEFAE0]">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#606C38] rounded-2xl flex items-center justify-center shadow-lg shadow-black">
            <BookOpen className="w-6 h-6 text-[#FEFAE0]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#FEFAE0]">Knowledge Base</h1>
            <p className="text-xs text-[#FEFAE0]/40 font-bold uppercase tracking-widest leading-none mt-1">Archive & Distill Intelligence</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Summarizer Panel (Bento Style) */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bento-card p-8 shadow-xl shadow-black/20 space-y-8 relative overflow-hidden group border-[#3D2B1F]">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <Sparkles className="w-32 h-32 text-[#606C38]" />
            </div>
            <div className="relative z-10 space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#2C1810] border border-[#3D2B1F] rounded-xl flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-[#606C38]" />
                </div>
                <h2 className="text-lg font-bold text-[#FEFAE0]">AI Synthesizer</h2>
              </div>
              
              <div className="space-y-4">
                <div className="relative">
                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-[#3D2B1F] rounded-2xl cursor-pointer hover:bg-[#2C1810]/50 transition-all hover:border-[#606C38] group overflow-hidden">
                    {isExtracting ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 text-[#606C38] animate-spin" />
                        <span className="text-[10px] font-black uppercase text-[#606C38]">Extracting intelligence...</span>
                      </div>
                    ) : fileName ? (
                      <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <FileText className="w-12 h-12 text-[#606C38]" />
                        <span className="text-sm font-bold text-[#FEFAE0] truncate max-w-full px-6">{fileName}</span>
                        <button 
                          onClick={(e) => { e.preventDefault(); clearFile(); }}
                          className="bg-black/40 px-4 py-1.5 rounded-full border border-[#3D2B1F] text-[#FEFAE0]/40 hover:text-rose-400 shadow-sm text-[10px] font-black uppercase"
                        >
                          Change File
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-10 h-10 text-[#FEFAE0]/20 group-hover:text-[#606C38]/50 mb-4" />
                        <p className="text-[10px] font-black text-[#FEFAE0]/30 uppercase tracking-widest group-hover:text-[#606C38] text-center px-8">Drop your study PDF here to begin synthesis</p>
                      </div>
                    )}
                    <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
                  </label>
                </div>
              </div>
              
              <button 
                onClick={handleSummarize}
                disabled={!pdfContext || isSummarizing || isExtracting}
                className="w-full bg-[#606C38] text-[#FEFAE0] py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-30 transition-all hover:bg-[#606C38]/80 active:scale-[0.98] shadow-lg shadow-black"
              >
                {isSummarizing ? (
                  <>Synthesizing Intelligence...</>
                ) : (
                  <>Distill Knowledge <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>

          <div className="bento-card p-8 bg-[#2C1810] text-[#FEFAE0] border-[#3D2B1F] space-y-3">
            <div className="w-10 h-10 bg-black/30 rounded-xl flex items-center justify-center text-xl shadow-inner">💡</div>
            <h4 className="text-sm font-bold">Concept Extraction</h4>
            <p className="text-xs text-[#FEFAE0]/50 font-medium leading-relaxed">
              Our AI doesn't just summarize; it identifies atomic concepts for your persistent knowledge graph.
            </p>
          </div>
        </div>

        {/* Notes List & Preview (Bento Style) */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <div className="flex items-center justify-between mb-2">
             <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#FEFAE0]/40">Knowledge Assets</h2>
             <div className="flex items-center gap-2 bento-card p-1.5 rounded-xl bg-[#2C1810]/50 backdrop-blur-sm shadow-none border-[#3D2B1F]">
               <Search className="w-3.5 h-3.5 text-[#FEFAE0]/20 ml-2" />
               <input placeholder="Filter assets..." className="bg-transparent border-none focus:outline-none text-[10px] font-bold uppercase tracking-wider text-[#FEFAE0] w-40" />
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              [1, 2, 3, 4].map(i => <div key={i} className="h-48 bento-card animate-pulse shadow-none opacity-50" />)
            ) : notes.length > 0 ? (
              notes.map((note, i) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  key={note.id} 
                  onClick={() => setSelectedNote(note)}
                  className="bento-card p-8 space-y-6 bento-card-hover cursor-pointer group"
                >
                  <div className="flex justify-between items-start">
                    <div className="w-10 h-10 bg-black/40 border border-[#3D2B1F] rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[#606C38] transition-colors">
                      <FileText className="w-5 h-5 text-[#FEFAE0]/30 group-hover:text-[#FEFAE0]" />
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                       <span className="text-[9px] uppercase tracking-widest font-black text-[#FEFAE0]/30 block">{formatDate(note.createdAt?.toDate())}</span>
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           if (confirm("Erase this asset?")) {
                             deleteDoc(doc(db, 'notes', note.id))
                               .then(() => fetchNotes())
                               .catch(err => handleFirestoreError(err, OperationType.DELETE, `notes/${note.id}`));
                           }
                         }}
                         className="p-1.5 hover:bg-rose-950/30 text-rose-300/40 hover:text-rose-400 rounded-lg transition-colors border border-transparent hover:border-rose-900/50"
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {note.source && (
                        <span className="text-[8px] font-black text-emerald-300 uppercase bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-900/40">{note.source}</span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-[#FEFAE0] line-clamp-1 group-hover:text-[#606C38] transition-colors">{note.title}</h3>
                    <p className="text-xs text-[#FEFAE0]/50 font-medium line-clamp-3 leading-relaxed opacity-80">{note.content}</p>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                     <span className="text-[9px] font-black uppercase bg-[#606C38]/10 text-[#606C38] px-2 py-1 rounded-lg border border-[#606C38]/30">Study Asset</span>
                     <span className="text-[9px] font-black uppercase bg-amber-950/30 text-amber-300 px-2 py-1 rounded-lg border border-amber-900/40">Reference #{(notes.length - i).toString().padStart(3, '0')}</span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="col-span-1 md:col-span-2 py-32 text-center space-y-8 bento-card border-dashed border-[#3D2B1F] bg-transparent shadow-none">
                <div className="w-20 h-20 bg-[#2C1810] rounded-[2rem] mx-auto flex items-center justify-center border border-[#3D2B1F]">
                  <Moon className="w-12 h-12 text-[#606C38] fill-current" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-[#FEFAE0]">Your Knowledge Vault</h3>
                  <p className="text-[10px] text-[#FEFAE0]/30 font-black uppercase tracking-widest">Feed the AI intelligence to begin storing assets.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Note Detail Modal */}
      <AnimatePresence>
        {selectedNote && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#2C1810] bento-card w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border-[#3D2B1F]"
            >
              <header className="p-8 border-b border-[#3D2B1F] flex justify-between items-center bg-black/20">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#606C38] bg-black/40 px-3 py-1 rounded-lg border border-[#606C38]/30">Asset Record • {formatDate(selectedNote.createdAt?.toDate())}</span>
                  <h2 className="text-2xl font-black tracking-tight text-[#FEFAE0]">{selectedNote.title}</h2>
                </div>
                <button 
                  onClick={() => setSelectedNote(null)}
                  className="p-3 bg-black/40 border border-[#3D2B1F] rounded-2xl text-[#FEFAE0]/30 hover:text-[#FEFAE0] hover:rotate-90 transition-all shadow-sm"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
                <section className="space-y-6">
                  <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#606C38]">
                    <Sparkles className="w-4 h-4" />
                    Synthesized Intelligence
                  </div>
                  <div 
                    ref={noteContentRef} 
                    className="markdown-body leading-relaxed text-sm font-medium p-8 md:p-12 rounded-[2rem] relative overflow-hidden"
                    style={{ 
                      backgroundColor: '#000000',
                      color: '#FEFAE0',
                      border: '1px solid #3D2B1F'
                    }}
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                       <Sparkles className="w-24 h-24" color="#606C38" />
                    </div>
                    <ReactMarkdown 
                      remarkPlugins={[remarkMath]} 
                      rehypePlugins={[rehypeKatex]}
                    >
                      {selectedNote.content}
                    </ReactMarkdown>
                  </div>
                </section>
                {selectedNote.originalContent && (
                  <section className="space-y-6 opacity-40 hover:opacity-100 transition-all duration-500">
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#FEFAE0]/30">
                      <ArrowRight className="w-4 h-4" />
                      Original Raw Source
                    </div>
                    <div className="text-xs text-[#FEFAE0]/40 italic font-medium leading-loose whitespace-pre-wrap p-8 border-l-2 border-[#3D2B1F]">
                      {selectedNote.originalContent}
                    </div>
                  </section>
                )}
              </div>
              <footer className="p-8 bg-black/20 border-t border-[#3D2B1F] flex justify-between items-center">
                <button 
                   className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-black/40 px-6 py-3 rounded-2xl border border-transparent hover:border-rose-900/50 transition-all disabled:opacity-50"
                   onClick={handleDelete}
                   disabled={isGeneratingQuiz || isExporting}
                >
                  <Trash2 className="w-4 h-4" />
                  Erase Data
                </button>
                <div className="flex gap-3">
                   <button 
                     onClick={handleExportPDF}
                     disabled={isExporting || isGeneratingQuiz}
                     className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#FEFAE0]/40 hover:bg-black/40 hover:text-[#FEFAE0] px-6 py-3 border border-transparent hover:border-[#3D2B1F] rounded-2xl transition-all disabled:opacity-50"
                   >
                     {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                     Export PDF
                   </button>
                   <button 
                     onClick={handleGenerateQuiz}
                     disabled={isGeneratingQuiz || isExporting}
                     className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-[#606C38] text-[#FEFAE0] px-8 py-3 rounded-2xl hover:bg-[#606C38]/80 transition-all shadow-lg shadow-black disabled:opacity-50"
                   >
                     {isGeneratingQuiz ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dna className="w-3 h-3" />}
                     Generate Quiz
                   </button>
                </div>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
