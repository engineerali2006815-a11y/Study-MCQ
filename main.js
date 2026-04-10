import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDd3qq84VinGuZP0Zcp-ZjLgC-uunhsK9E",
    authDomain: "study-b0235.firebaseapp.com",
    projectId: "study-b0235",
    storageBucket: "study-b0235.firebasestorage.app",
    messagingSenderId: "240734668137",
    appId: "1:240734668137:web:3a42a4c07b3f832851e9f8",
    measurementId: "G-F6DN1QWCDV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Views
    const dashboardView = document.getElementById('dashboard-view');
    const inputView = document.getElementById('input-view');
    const reviewView = document.getElementById('review-view');

    // DOM Elements - Dashboard
    const createNewBtn = document.getElementById('create-new-btn');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const importFileInput = document.getElementById('import-file-input');
    const setsGrid = document.getElementById('sets-grid');

    // DOM Elements - Input
    const setNameInput = document.getElementById('set-name-input');
    const questionsInput = document.getElementById('questions-input');
    const saveSetBtn = document.getElementById('save-set-btn');
    const cancelCreateBtn = document.getElementById('cancel-create-btn');

    // DOM Elements - Review
    const backToLibraryBtn = document.getElementById('back-to-library-btn');
    const progressIndicator = document.getElementById('progress-indicator');
    const questionDisplay = document.getElementById('question-display');
    const optionsContainer = document.getElementById('options-container');
    const translationBlock = document.getElementById('translation-block');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const translateBtn = document.getElementById('translate-btn');

    // State
    let savedSets = [];
    let currentQuestions = [];
    let currentIndex = 0;
    const translationCache = new Map();

    // Start by fetching from Firestore
    fetchFromFirestore();

    // Event Listeners
    createNewBtn.addEventListener('click', () => {
        setNameInput.value = '';
        questionsInput.value = '';
        switchView(dashboardView, inputView);
    });

    cancelCreateBtn.addEventListener('click', () => {
        switchView(inputView, dashboardView);
    });

    saveSetBtn.addEventListener('click', handleSaveSet);

    backToLibraryBtn.addEventListener('click', () => {
        translationBlock.classList.add('hidden');
        translationBlock.innerHTML = '';
        translateBtn.textContent = 'Translate';
        switchView(reviewView, dashboardView);
    });

    prevBtn.addEventListener('click', showPrevious);
    nextBtn.addEventListener('click', showNext);
    translateBtn.addEventListener('click', handleTranslate);

    // Import / Export
    exportBtn.addEventListener('click', handleExport);
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', handleImport);

    // Functions
    function switchView(hideView, showView) {
        hideView.style.opacity = 0;
        setTimeout(() => {
            hideView.classList.remove('active');
            showView.classList.add('active');
            setTimeout(() => {
                showView.style.opacity = 1;
            }, 50);
        }, 400);
    }

    async function fetchFromFirestore() {
        setsGrid.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-secondary);">Loading from Firebase...</p>';
        try {
            const querySnapshot = await getDocs(collection(db, "studySets"));
            savedSets = [];
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                data.firestoreId = docSnap.id;
                savedSets.push(data);
            });
            renderDashboard();
        } catch (error) {
            console.error("Error fetching from Firebase:", error);
            setsGrid.innerHTML = '<p style="grid-column: 1/-1; color: #F44336;">Error loading data from Firebase. Make sure to configure apiKey.</p>';
        }
    }

    function renderDashboard() {
        setsGrid.innerHTML = '';
        if (savedSets.length === 0) {
            setsGrid.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-secondary);">No sets found. Click "+ Add Set" to create one.</p>';
            return;
        }

        savedSets.forEach((set, index) => {
            const card = document.createElement('div');
            card.className = 'set-card';

            const contentDiv = document.createElement('div');
            contentDiv.innerHTML = `
                <div class="set-card-title">${set.name}</div>
                <div class="set-card-count">${set.questions.length} Questions</div>
            `;

            const footerDiv = document.createElement('div');
            footerDiv.className = 'set-card-footer';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-set-btn';
            deleteBtn.innerHTML = '🗑 Delete';

            deleteBtn.onclick = async (e) => {
                e.stopPropagation(); // prevent card click
                if (confirm(`Are you sure you want to delete "${set.name}"?`)) {
                    const originalText = deleteBtn.innerHTML;
                    deleteBtn.innerHTML = 'Deleting...';
                    deleteBtn.disabled = true;

                    try {
                        if (set.firestoreId) {
                            await deleteDoc(doc(db, "studySets", set.firestoreId));
                        }
                        savedSets.splice(index, 1);
                        renderDashboard();
                    } catch (error) {
                        console.error("Error deleting document", error);
                        alert("Failed to delete from Firestore");
                        deleteBtn.innerHTML = originalText;
                        deleteBtn.disabled = false;
                    }
                }
            };

            footerDiv.appendChild(deleteBtn);

            card.appendChild(contentDiv);
            card.appendChild(footerDiv);

            card.addEventListener('click', () => startReview(set.questions));
            setsGrid.appendChild(card);
        });
    }

    async function handleSaveSet() {
        const setName = setNameInput.value.trim();
        const rawText = questionsInput.value.trim();

        if (!setName) {
            alert('Please enter a name for this set.');
            return;
        }
        if (!rawText) {
            alert('Please enter some questions.');
            return;
        }

        const blocks = rawText.split('###').map(q => q.trim()).filter(q => q.length > 0);
        const parsedQuestions = blocks.map(block => {
            const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const questionText = lines[0] || 'Unknown Question';
            const options = [];
            let correctAnswerIndex = -1;

            for (let i = 1; i < lines.length; i++) {
                let optText = lines[i];
                if (optText.startsWith('*')) {
                    correctAnswerIndex = i - 1;
                    optText = optText.substring(1).trim();
                }
                options.push(optText);
            }

            if (correctAnswerIndex === -1 && options.length > 0) correctAnswerIndex = 0;

            return {
                questionText,
                options,
                correctAnswerIndex,
                fullText: questionText + '\n' + options.join('\n')
            };
        });

        if (parsedQuestions.length === 0) {
            alert('No valid questions found.');
            return;
        }

        const newSet = {
            name: setName,
            questions: parsedQuestions
        };

        saveSetBtn.disabled = true;
        saveSetBtn.textContent = 'Saving...';

        try {
            const docRef = await addDoc(collection(db, "studySets"), newSet);
            newSet.firestoreId = docRef.id;
            savedSets.push(newSet);
            renderDashboard();
            switchView(inputView, dashboardView);
        } catch (error) {
            console.error("Error saving document:", error);
            alert("Failed to save to Firestore. Check configuration.");
        } finally {
            saveSetBtn.disabled = false;
            saveSetBtn.textContent = 'Save';
        }
    }

    function startReview(questionsArray) {
        currentQuestions = JSON.parse(JSON.stringify(questionsArray));

        // Shuffle questions randomly
        for (let i = currentQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [currentQuestions[i], currentQuestions[j]] = [currentQuestions[j], currentQuestions[i]];
        }

        currentIndex = 0;
        switchView(dashboardView, reviewView);
        renderQuestion();
    }

    function renderQuestion() {
        questionDisplay.style.opacity = 0;
        optionsContainer.style.opacity = 0;

        setTimeout(() => {
            const currentQ = currentQuestions[currentIndex];
            questionDisplay.textContent = currentQ.questionText;
            progressIndicator.textContent = `Question ${currentIndex + 1} of ${currentQuestions.length}`;

            optionsContainer.innerHTML = '';
            let answered = false;

            if (currentQ.options.length === 0) {
                const msg = document.createElement('div');
                msg.textContent = 'No options available.';
                msg.style.color = 'var(--text-secondary)';
                optionsContainer.appendChild(msg);
                nextBtn.style.display = 'inline-block';
                nextBtn.disabled = false;
            } else {
                currentQ.options.forEach((optText, index) => {
                    const btn = document.createElement('button');
                    btn.className = 'option-btn';
                    btn.textContent = optText;

                    btn.addEventListener('click', () => {
                        if (answered) return;
                        answered = true;

                        nextBtn.style.display = 'inline-block';
                        nextBtn.disabled = false;

                        if (index === currentQ.correctAnswerIndex) {
                            btn.classList.add('correct');
                        } else {
                            btn.classList.add('incorrect');
                            Array.from(optionsContainer.children)[currentQ.correctAnswerIndex].classList.add('correct');
                            currentQuestions.push(currentQ);
                            progressIndicator.textContent = `Question ${currentIndex + 1} of ${currentQuestions.length}`;
                        }

                        Array.from(optionsContainer.children).forEach(child => {
                            child.disabled = true;
                        });
                    });
                    optionsContainer.appendChild(btn);
                });
            }

            translationBlock.classList.add('hidden');
            translationBlock.innerHTML = '';
            translateBtn.textContent = 'Translate';
            nextBtn.style.display = 'none';

            questionDisplay.style.opacity = 1;
            optionsContainer.style.opacity = 1;
        }, 300);
    }

    function showPrevious() { }

    function showNext() {
        if (currentIndex < currentQuestions.length - 1) {
            currentIndex++;
            renderQuestion();
        } else {
            alert("Great job! You've successfully finished all the questions.");
            backToLibraryBtn.click();
        }
    }

    async function handleTranslate() {
        if (!translationBlock.classList.contains('hidden')) {
            translationBlock.classList.add('hidden');
            translateBtn.textContent = 'Translate';
            return;
        }

        const currentQ = currentQuestions[currentIndex];
        if (!currentQ) return;
        const currentText = currentQ.fullText;

        translationBlock.classList.remove('hidden');
        translateBtn.textContent = 'Hide Translation';

        if (translationCache.has(currentText)) {
            translationBlock.innerHTML = translationCache.get(currentText);
            return;
        }

        translationBlock.innerHTML = '<span class="loading">...جاري الترجمة...</span>';
        translateBtn.disabled = true;

        try {
            const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(currentText)}&langpair=en|ar`);
            const data = await response.json();

            if (data.responseStatus === 200 || data.responseStatus === "200") {
                const translatedText = data.responseData.translatedText;
                translationCache.set(currentText, translatedText);
                translationBlock.innerHTML = translatedText;
            } else {
                translationBlock.innerHTML = 'Error fetching translation. (Length may exceed API limits)';
            }
        } catch (error) {
            console.error("Translation error:", error);
            translationBlock.innerHTML = 'Error fetching translation.';
        } finally {
            translateBtn.disabled = false;
        }
    }

    function handleExport() {
        if (savedSets.length === 0) {
            alert('No sets to export.');
            return;
        }
        const dataStr = JSON.stringify(savedSets, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "study_sets_backup.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function (evt) {
            try {
                const importedSets = JSON.parse(evt.target.result);
                if (Array.isArray(importedSets)) {
                    const originalText = importBtn.innerHTML;
                    importBtn.innerHTML = 'Importing...';
                    importBtn.disabled = true;

                    for (const set of importedSets) {
                        const newSet = {
                            name: set.name,
                            questions: set.questions
                        };
                        const docRef = await addDoc(collection(db, "studySets"), newSet);
                        newSet.firestoreId = docRef.id;
                        savedSets.push(newSet);
                    }
                    renderDashboard();
                    alert("Import successful! Data saved to Firebase.");

                    importBtn.innerHTML = originalText;
                    importBtn.disabled = false;
                } else {
                    alert("Invalid file format.");
                }
            } catch (err) {
                alert("Error parsing file or saving to Firebase.");
                importBtn.disabled = false;
            }
        };
        reader.readAsText(file);
        importFileInput.value = '';
    }
});
