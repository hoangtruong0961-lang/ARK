import React from 'react';
import { renderToString } from 'react-dom/server';
import { applySTRegex } from './src/utils/regex';
import { MarkdownRenderer } from './src/components/common/MarkdownRenderer';

const htmlString = `<!DOCTYPE html><html lang="vi-VN"><head>    <meta charset="UTF-8">    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">    <title>MAGE SYSTEM: DIGITAL EVOLUTION V2.1</title>    <link href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" rel="stylesheet">    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Noto+Sans+SC:wght@400;700&display=swap" rel="stylesheet">    <style>        :root {            --primary-blue: #00BFFF; /* Màu xanh da trời */            --dark-gold: #B8860B;     /* Màu vàng sẫm */            --bg-dark: #0a1020;            --glass: rgba(0, 191, 255, 0.1);        }        body {            font-family: 'Noto Sans SC', sans-serif;            background-color: var(--bg-dark);            background-image:                linear-gradient(rgba(0, 191, 255, 0.05) 1px, transparent 1px),                linear-gradient(90deg, rgba(0, 191, 255, 0.05) 1px, transparent 1px);            background-size: 30px 30px;            color: white;            margin: 0;            padding: 10px;            min-height: 100vh;            overflow-x: hidden;        }    </style></head><body><div class="digital-bg"></div><div class="main-container animate__animated animate__fadeIn">    <h1>Toàn Chức Pháp Sư: Trình mô phỏng giác tỉnh</h1></div></body></html>`;

const text = "Mở đầu\n\n[Mở đầu: Hello World]\n";

const scripts = [{
  regex: "\\[Mở đầu:.*?\\]",
  flags: "gi",
  replacement: htmlString,
  placement: [2],
  isEnabled: true,
  name: "UI Script"
}];

const result = applySTRegex(text, scripts as any);
console.log("Regex Applied Result:");
console.log(result.substring(0, 100) + "...");

const html = renderToString(React.createElement(MarkdownRenderer, { content: result, regexScripts: [] }));
console.log("Rendered HTML:");
console.log(html.substring(0, 300) + "...");
