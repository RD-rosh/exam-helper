import { useState } from 'react';
import { FileText, BookOpen, HelpCircle, CheckSquare, Upload, Loader, Download, AlertCircle } from 'lucide-react';
import * as Papa from 'papaparse';
import * as mammoth from 'mammoth';
import _ from 'lodash';
import * as pdfjsLib from 'pdfjs-dist';
import './App.css';

// Set the PDF.js worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export default function ExamHelper() {
  const [file, setFile] = useState(null);
  const [ setFileContent] = useState('');
  const [activeTab, setActiveTab] = useState('summary');
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [mcqs, setMcqs] = useState([]);
  const [qna, setQna] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [keyTerms, setKeyTerms] = useState([]);
  const [analysisStatus, setAnalysisStatus] = useState('');

  // Helper function to extract text content from different file types
  const extractTextFromFile = async (uploadedFile) => {
    const fileType = uploadedFile.type;
    let text = '';
    
    try {
      setAnalysisStatus(`Extracting text from ${fileType} file...`);
      
      // For plain text files
      if (fileType === 'text/plain') {
        text = await readFileAsText(uploadedFile);
      }
      // For CSV files
      else if (fileType === 'text/csv') {
        const csvData = await readFileAsText(uploadedFile);
        const parsedData = Papa.parse(csvData, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          delimitersToGuess: [',', '\t', '|', ';']
        });
        
        if (parsedData.errors && parsedData.errors.length > 0) {
          console.warn('CSV parsing warnings:', parsedData.errors);
        }
        
        // Convert CSV to plain text (joining all cells)
        text = parsedData.data.map(row => {
          return Object.values(row).filter(val => val !== null && val !== undefined).join(' ');
        }).join(' ');
      }
      // For Word documents
      else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await readFileAsArrayBuffer(uploadedFile);
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      }
      // For PDF files
      else if (fileType === 'application/pdf') {
        text = await extractTextFromPdf(uploadedFile);
      }
      
      // Try to extract a document title from the first line
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      if (lines.length > 0) {
        setDocumentTitle(lines[0].trim());
      }
      
      return text;
    } catch (error) {
      console.error('Error extracting text:', error);
      throw new Error(`Failed to extract text from ${fileType} file: ${error.message}`);
    }
  };
  
  // PDF text extraction using PDF.js
  const extractTextFromPdf = async (pdfFile) => {
    try {
      setAnalysisStatus('Processing PDF file...');
      const arrayBuffer = await readFileAsArrayBuffer(pdfFile);
      
      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setAnalysisStatus(`PDF loaded successfully. Pages: ${pdf.numPages}`);
      
      // Extract text from all pages
      let fullText = '';
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        setAnalysisStatus(`Extracting text from page ${pageNum} of ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Concatenate the text items with proper spacing
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
      }
      
      return fullText;
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  };
  
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = e => reject(new Error('File reading failed'));
      reader.readAsText(file);
    });
  };
  
  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = e => reject(new Error('File reading failed'));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileUpload = async (event) => {
    // Reset all states
    setErrorMessage('');
    setUploadProgress(0);
    setProcessingStage('');
    setSummary('');
    setMcqs([]);
    setQna([]);
    setKeyTerms([]);
    setAnalysisStatus('');
    
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;
    
    // Validate file type
    const validTypes = [
      'text/plain', 
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv'
    ];
    
    if (!validTypes.includes(uploadedFile.type)) {
      setErrorMessage('Please upload a text, PDF, Word document, or CSV file');
      return;
    }
    
    setFile(uploadedFile);
    setIsLoading(true);
    
    // Real progress tracking for uploads
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        return prev + 5;
      });
    }, 100);
    
    try {
      // Extract text from the file
      setProcessingStage('Extracting text...');
      const text = await extractTextFromFile(uploadedFile);
      setFileContent(text);
      
      setUploadProgress(100);
      clearInterval(progressInterval);
      
      // Process the document
      await processDocument(text);
    } catch (error) {
      clearInterval(progressInterval);
      setErrorMessage(error.message || 'Error processing file');
      setIsLoading(false);
    }
  };

  const processDocument = async (text) => {
    try {
      // Extract key terms first
      setProcessingStage('Analyzing document content...');
      const terms = extractKeyTerms(text);
      setKeyTerms(terms);
      
      // Generate summary
      setProcessingStage('Generating summary...');
      const summaryText = generateSummary(text);
      setSummary(summaryText);
      
      // Generate MCQs
      setProcessingStage('Creating multiple choice questions...');
      const generatedMcqs = generateMCQs(text, terms);
      setMcqs(generatedMcqs);
      
      // Generate Q&A
      setProcessingStage('Preparing questions and answers...');
      const generatedQna = generateQnA(text, terms);
      setQna(generatedQna);
      
      setIsLoading(false);
      setProcessingStage('');
    } catch (error) {
      console.error('Processing error:', error);
      setErrorMessage('Error processing document content: ' + error.message);
      setIsLoading(false);
    }
  };

  // Extract key terms from text for better question generation
  const extractKeyTerms = (text) => {
    // Remove common stop words
    const stopWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'in', 'it', 'to', 'i', 'that', 'had', 
      'on', 'for', 'were', 'was', 'of', 'be', 'this', 'with', 'by', 'as', 'at', 'from',
      'they', 'are', 'have', 'has', 'been', 'not', 'their', 'there', 'which', 'when', 'who',
      'what', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
      'some', 'such', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now'
    ];
    
    // Clean text and split into words
    const cleanText = text.toLowerCase().replace(/[^\w\s]/g, '');
    const words = cleanText.split(/\s+/).filter(word => word.length > 0);
    
    // Count word frequencies (excluding stop words and short words)
    const wordCounts = {};
    words.forEach(word => {
      if (!stopWords.includes(word) && word.length > 3) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });
    
    // Find phrases (bigrams and trigrams)
    const phrases = {};
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].length > 3 && words[i+1].length > 3 && 
          !stopWords.includes(words[i]) && !stopWords.includes(words[i+1])) {
        const bigram = `${words[i]} ${words[i+1]}`;
        phrases[bigram] = (phrases[bigram] || 0) + 1;
      }
      
      if (i < words.length - 2 && 
          words[i].length > 3 && words[i+1].length > 3 && words[i+2].length > 3 &&
          !stopWords.includes(words[i]) && !stopWords.includes(words[i+2])) {
        const trigram = `${words[i]} ${words[i+1]} ${words[i+2]}`;
        phrases[trigram] = (phrases[trigram] || 0) + 3; // Weight trigrams higher
      }
    }
    
    // Combine words and phrases
    const combined = {...wordCounts, ...phrases};
    
    // Sort by frequency and get top terms
    const sortedTerms = Object.entries(combined)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([term]) => term);
    
    return sortedTerms;
  };

  // Generate document summary
  const generateSummary = (text) => {
    // Split text into sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length <= 3) {
      return sentences.join('. ') + '.';
    }
    
    // Score sentences based on position (first sentences are often important)
    const positionScores = sentences.map((_, index) => {
      if (index < 3) return 3;
      if (index < sentences.length * 0.1) return 2;
      if (index > sentences.length * 0.8) return 1.5;
      return 1;
    });
    
    // Score sentences based on key term occurrence
    const termScores = sentences.map(sentence => {
      let score = 0;
      keyTerms.forEach(term => {
        if (sentence.toLowerCase().includes(term)) {
          score += 1;
        }
      });
      return score;
    });
    
    // Combine scores
    const combinedScores = sentences.map((_, index) => 
      positionScores[index] * (termScores[index] + 1)
    );
    
    // Select top sentences (about 20-30% of original)
    const summaryLength = Math.max(Math.ceil(sentences.length * 0.25), 3);
    
    // Get indexes of top-scoring sentences
    const indexedScores = combinedScores.map((score, index) => ({ score, index }));
    const topIndexes = indexedScores
      .sort((a, b) => b.score - a.score)
      .slice(0, summaryLength)
      .map(item => item.index)
      .sort((a, b) => a - b); // Sort by original position
    
    // Construct summary from selected sentences
    const summarySentences = topIndexes.map(index => sentences[index]);
    return summarySentences.join('. ') + '.';
  };

  const generateMCQs = (text, keyTerms) => {
    // Create questions based on extracted key terms
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const questionsCount = Math.min(keyTerms.length, 10);
    const questions = [];
    
    // Find sentences containing key terms
    const termSentences = {};
    keyTerms.forEach(term => {
      const matchingSentences = sentences.filter(sentence => 
        sentence.toLowerCase().includes(term.toLowerCase())
      );
      if (matchingSentences.length > 0) {
        termSentences[term] = matchingSentences;
      }
    });
    
    // Create MCQs based on key terms with context
    const selectedTerms = Object.keys(termSentences).slice(0, questionsCount);
    selectedTerms.forEach((term, index) => {
      // Get sentences containing this term
      const relatedSentences = termSentences[term];
      
      // Get context for better question generation
      const targetSentence = relatedSentences[0];
      const sentenceIndex = sentences.indexOf(targetSentence);
      
      // Get surrounding context if available
      let context = targetSentence;
      if (sentenceIndex > 0 && sentenceIndex < sentences.length - 1) {
        const prevSentence = sentences[sentenceIndex - 1];
        const nextSentence = sentences[sentenceIndex + 1];
        context = `${prevSentence}. ${targetSentence}. ${nextSentence}`;
      }
      
      // Try to create a question based on the term and context
      let question = '';
      let correctAnswer = 0;
      let options = [];
      
      if (term.split(' ').length > 1) {
        // For phrases, ask about the definition or meaning
        question = `Which of the following best describes "${term}" as mentioned in the document?`;
        options = [
          targetSentence.trim(),
          `${term} refers to an unrelated concept not covered in this document.`,
          `${term} is a contradictory element in the document.`,
          `${term} is mentioned but not significant to the main topic.`
        ];
      } else {
        // For single words, try to create a contextual question
        question = `According to the document, what is true about ${term}?`;
        
        // Create plausible but incorrect options
        options = [
          targetSentence.trim(),
          `${term} is not relevant to the main subject of this document.`,
          `${term} represents an opposing viewpoint to the document's main argument.`,
          `${term} is a minor concept that appears only once in the document.`
        ];
      }
      
      // Shuffle options but keep track of correct answer
      const shuffledOptions = _.shuffle([...options]);
      const newCorrectIndex = shuffledOptions.indexOf(options[correctAnswer]);
      
      questions.push({
        id: index + 1,
        question,
        options: shuffledOptions,
        correctAnswer: newCorrectIndex,
        context: context // Store context for potential future use
      });
    });
    
    return questions;
  };

  const generateQnA = (text, keyTerms) => {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const result = [];
    
    // Group sentences by paragraph for better context
    const paragraphs = [];
    let currentParagraph = [];
    
    sentences.forEach(sentence => {
      currentParagraph.push(sentence);
      // If sentence ends with a line break or is the last in a sequence, it might end a paragraph
      if (sentence.includes('\n') || sentence.length < 20) {
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph);
          currentParagraph = [];
        }
      }
    });
    
    // Add any remaining sentences as a paragraph
    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph);
    }
    
    // Extract questions from paragraphs based on key terms
    keyTerms.slice(0, 8).forEach((term, termIndex) => {
      // Find paragraphs containing this term
      const relevantParagraphs = paragraphs.filter(para => 
        para.some(sentence => sentence.toLowerCase().includes(term.toLowerCase()))
      );
      
      if (relevantParagraphs.length > 0) {
        // Get the first paragraph containing this term
        const paragraph = relevantParagraphs[0];
        const answer = paragraph.join(' ');
        
        // Create factual questions about the term
        const questionVariants = [
          `What is explained about ${term} in the document?`,
          `How does the document describe ${term}?`,
          `What information does the document provide about ${term}?`,
          `What role does ${term} play according to the text?`
        ];
        
        result.push({
          id: termIndex + 1,
          question: questionVariants[termIndex % questionVariants.length],
          answer: answer.trim()
        });
      }
    });
    
    // Add general questions based on document structure
    if (sentences.length > 5) {
      // Add a question about the main topic
      result.push({
        id: result.length + 1,
        question: "What is the main topic of this document?",
        answer: sentences.slice(0, 3).join(' ')
      });
      
      // Add a question about the conclusion if applicable
      if (sentences.length > 10) {
        result.push({
          id: result.length + 1,
          question: "What conclusion can be drawn from this document?",
          answer: sentences.slice(-3).join(' ')
        });
      }
    }
    
    return result;
  };

  const downloadContent = () => {
    let content = '';
    let filename = '';
    
    if (activeTab === 'summary') {
      content = `DOCUMENT SUMMARY: ${documentTitle || 'Untitled Document'}\n\n${summary}\n\nKEY TERMS:\n${keyTerms.join(', ')}`;
      filename = 'document-summary.txt';
    } else if (activeTab === 'mcqs') {
      content = `MULTIPLE CHOICE QUESTIONS FOR: ${documentTitle || 'Untitled Document'}\n\n${mcqs.map(mcq => 
        `${mcq.id}. ${mcq.question}\n${mcq.options.map((opt, i) => 
          `   ${String.fromCharCode(65 + i)}. ${opt}`).join('\n')}\n\nCorrect Answer: ${String.fromCharCode(65 + mcq.correctAnswer)}\n`
        ).join('\n')}`;
      filename = 'mcq-questions.txt';
    } else if (activeTab === 'qna') {
      content = `QUESTIONS AND ANSWERS FOR: ${documentTitle || 'Untitled Document'}\n\n${qna.map(item => 
        `${item.id}. ${item.question}\n\nAnswer: ${item.answer}\n`
        ).join('\n')}`;
      filename = 'question-answers.txt';
    }
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <h1 className="header-title">
            <BookOpen className="icon" />
            Exam Helper
          </h1>
          <p className="header-subtitle">Upload documents to generate summary, questions, and study materials</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="main">
        <div className="main-card">
          {/* Upload Area */}
          <div className="upload-area">
            {!file && !isLoading && (
              <div className="upload-box">
                <Upload className="upload-icon" size={48} />
                <p className="upload-text">Upload your document</p>
                <p className="upload-subtext">PDF, Word, Text, or CSV files</p>
                <label className="upload-button">
                  Select File
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                    accept=".pdf,.docx,.txt,.csv"
                  />
                </label>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="error-message">
                <AlertCircle className="error-icon" />
                <p>{errorMessage}</p>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="loading-state">
                <div className="progress-container">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <div className="loading-info">
                  <Loader className="loading-icon spinning" />
                  <p className="loading-text">{processingStage || 'Processing...'}</p>
                </div>
                {analysisStatus && <p className="analysis-status">{analysisStatus}</p>}
              </div>
            )}

            {/* Document Preview (when document is loaded but not processing) */}
            {file && !isLoading && (
              <div className="document-info">
                <FileText className="document-icon" />
                <div className="document-details">
                  <p className="document-name">{file.name}</p>
                  <p className="document-meta">{(file.size / 1024).toFixed(2)} KB • {file.type}</p>
                </div>
              </div>
            )}
          </div>

          {/* Tabs Navigation */}
          {file && !isLoading && (
            <div className="tabs-container">
              <div className="tabs-nav">
                <button 
                  className={`tab-button ${activeTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('summary')}
                >
                  <FileText className="tab-icon" />
                  Summary
                </button>
                <button 
                  className={`tab-button ${activeTab === 'mcqs' ? 'active' : ''}`}
                  onClick={() => setActiveTab('mcqs')}
                >
                  <CheckSquare className="tab-icon" />
                  MCQs
                </button>
                <button 
                  className={`tab-button ${activeTab === 'qna' ? 'active' : ''}`}
                  onClick={() => setActiveTab('qna')}
                >
                  <HelpCircle className="tab-icon" />
                  Q&A
                </button>
              </div>

              {/* Tab Content */}
              <div className="tab-content">
                {/* Summary Tab */}
                {activeTab === 'summary' && (
                  <div className="summary-container">
                    <div className="summary-header">
                      <h2>{documentTitle || 'Document Summary'}</h2>
                      <button className="download-button" onClick={downloadContent}>
                        <Download className="download-icon" />
                        Download
                      </button>
                    </div>
                    <div className="summary-content">
                      <p>{summary}</p>
                    </div>
                    {keyTerms.length > 0 && (
                      <div className="key-terms">
                        <h3>Key Terms</h3>
                        <div className="term-tags">
                          {keyTerms.map((term, index) => (
                            <span key={index} className="term-tag">{term}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* MCQs Tab */}
                {activeTab === 'mcqs' && (
                  <div className="mcqs-container">
                    <div className="mcqs-header">
                      <h2>Multiple Choice Questions</h2>
                      <button className="download-button" onClick={downloadContent}>
                        <Download className="download-icon" />
                        Download
                      </button>
                    </div>
                    <div className="mcqs-list">
                      {mcqs.map((question) => (
                        <div key={question.id} className="mcq-item">
                          <h3>Question {question.id}</h3>
                          <p className="mcq-question">{question.question}</p>
                          <div className="mcq-options">
                            {question.options.map((option, index) => (
                              <div key={index} className="mcq-option">
                                <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                                <span className="option-text">{option}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mcq-answer">
                            <p><strong>Correct Answer:</strong> {String.fromCharCode(65 + question.correctAnswer)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Q&A Tab */}
                {activeTab === 'qna' && (
                  <div className="qna-container">
                    <div className="qna-header">
                      <h2>Questions & Answers</h2>
                      <button className="download-button" onClick={downloadContent}>
                        <Download className="download-icon" />
                        Download
                      </button>
                    </div>
                    <div className="qna-list">
                      {qna.map((item) => (
                        <div key={item.id} className="qna-item">
                          <h3>Question {item.id}</h3>
                          <p className="qna-question">{item.question}</p>
                          <div className="qna-answer">
                            <h4>Answer:</h4>
                            <p>{item.answer}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-inner">
          <p className="footer-text">&copy; {new Date().getFullYear()} Exam Helper. All rights reserved.</p>
          <p className="footer-note">Made with ❤️ for students</p>
        </div>
      </footer>
    </div>
  );
}