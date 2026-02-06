// app.js (Final version: Local Inference + GAS Logging)
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";

// Конфигурация
const GAS_URL = "https://script.google.com/macros/s/AKfycbwd7yhCSjB7VqjwX7S9oC0iNRtrNYxd4K5sybZducV8FZFsYEUb5YPXQaX5-y5JEbI/exec";

// Global variables
let reviews = [];
let sentimentPipeline = null;

// DOM elements
const analyzeBtn = document.getElementById("analyze-btn");
const reviewText = document.getElementById("review-text");
const sentimentResult = document.getElementById("sentiment-result");
const loadingElement = document.querySelector(".loading");
const errorElement = document.getElementById("error-message");
const apiTokenInput = document.getElementById("api-token");
const statusElement = document.getElementById("status");

// Initialize the app
document.addEventListener("DOMContentLoaded", function () {
    loadReviews();
    
    // Создаем или получаем pseudoId для логов
    if (!localStorage.getItem("pseudoId")) {
        localStorage.setItem("pseudoId", "user_" + Math.random().toString(36).substr(2, 9));
    }

    analyzeBtn.addEventListener("click", analyzeRandomReview);
    initSentimentModel();
});

// Загрузка модели Transformers.js
async function initSentimentModel() {
    try {
        if (statusElement) statusElement.textContent = "Loading sentiment model...";
        sentimentPipeline = await pipeline("text-classification", "Xenova/distilbert-base-uncased-finetuned-sst-2-english");
        if (statusElement) statusElement.textContent = "Sentiment model ready ✅";
    } catch (error) {
        console.error("Failed to load model:", error);
        showError("Failed to load AI model.");
    }
}

// Загрузка отзывов из TSV
function loadReviews() {
    fetch("reviews_test.tsv")
        .then(response => response.text())
        .then(tsvData => {
            Papa.parse(tsvData, {
                header: true,
                delimiter: "\t",
                skipEmptyLines: true,
                complete: (results) => {
                    reviews = results.data
                        .map(row => row.text)
                        .filter(text => text && text.trim() !== "");
                    console.log("Loaded", reviews.length, "reviews");
                }
            });
        })
        .catch(err => showError("TSV file not found."));
}

// Основная функция анализа
async function analyzeRandomReview() {
    hideError();
    if (reviews.length === 0 || !sentimentPipeline) return;

    const selectedReview = reviews[Math.floor(Math.random() * reviews.length)];
    reviewText.textContent = selectedReview;

    loadingElement.style.display = "block";
    analyzeBtn.disabled = true;
    sentimentResult.innerHTML = "";

    try {
        const output = await sentimentPipeline(selectedReview);
        const result = output[0]; // {label: 'POSITIVE', score: 0.99}
        
        displaySentiment(result);
        
        // ОТПРАВКА ЛОГА В ТАБЛИЦУ
        await sendLogToGAS(selectedReview, result.label, result.score);

    } catch (error) {
        showError("Analysis failed.");
    } finally {
        loadingElement.style.display = "none";
        analyzeBtn.disabled = false;
    }
}

// Функция отправки данных в Google Sheets (Simple Request)
async function sendLogToGAS(text, label, score) {
    const payload = {
        ts_iso: new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),,
        review: text,
        sentiment: `${label} (${(score * 100).toFixed(0)}%)`,
        meta: JSON.stringify({
            userId: localStorage.getItem("pseudoId"),
            ua: navigator.userAgent
        })
    };

    try {
        // Используем mode: 'no-cors' для обхода preflight, как требует ТЗ
        await fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(payload).toString()
        });
        console.log("Log sent to Google Sheets");
    } catch (e) {
        console.warn("Log failed (possibly CORS, but data usually reaches GAS)");
    }
}

// Отображение результата
function displaySentiment(data) {
    const label = data.label.toUpperCase();
    const score = data.score;
    let type = label === "POSITIVE" ? "positive" : "negative";

    sentimentResult.className = `sentiment-result ${type}`;
    sentimentResult.innerHTML = `
        <i class="fas ${type === 'positive' ? 'fa-thumbs-up' : 'fa-thumbs-down'} icon"></i>
        <span>${label} (${(score * 100).toFixed(1)}% confidence)</span>
    `;
}

function showError(m) { errorElement.textContent = m; errorElement.style.display = "block"; }
function hideError() { errorElement.style.display = "none"; }
