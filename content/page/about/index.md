---
title: "About"
slug: about
description: "Meet me — skills, experience, and how to reach me."
comments: false
license: false
toc: false
cvPage: true
menu:
  main:
    weight: -90
    params: { icon: user }
---
<style>
.article-header,.article-metadata,.language-switch,.article-translations{display:none!important}
.about-page{max-width:980px;margin:0 auto;padding:2rem 0 4rem;color:var(--card-text-color-main)}
.about-page>*{opacity:0;animation:about-rise .7s cubic-bezier(.16,1,.3,1) forwards}
.about-page>:nth-child(2){animation-delay:.08s}.about-page>:nth-child(3){animation-delay:.14s}.about-page>:nth-child(4){animation-delay:.2s}
@keyframes about-rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
.about-hero,.about-section{padding:clamp(2rem,5vw,3.5rem);margin-bottom:1.6rem;background:var(--card-background);border:1px solid rgba(var(--accent-color-rgb),.22);border-radius:28px;box-shadow:var(--shadow-l1)}
.about-hero{padding:clamp(2.5rem,7vw,5.5rem);background:radial-gradient(circle at 92% 10%,rgba(var(--accent-color-rgb),.2),transparent 34%),var(--card-background)}
.about-kicker{margin:0 0 1.2rem;color:var(--accent-color);font-size:1.3rem;font-weight:750;letter-spacing:.14em;text-transform:uppercase}
.about-hero h1{margin:0;font-size:clamp(3.8rem,9vw,7rem);line-height:1;letter-spacing:-.05em}.about-profile{max-width:780px;margin:2.2rem 0 0;color:var(--card-text-color-secondary);font-size:1.7rem;line-height:1.75}
.about-nav{display:flex;flex-wrap:wrap;gap:.8rem;margin:1.5rem 0 3rem;padding:0;list-style:none}.about-nav a{display:block;padding:.8rem 1.2rem;color:var(--card-text-color-secondary);font-size:1.3rem;font-weight:700;text-decoration:none;background:var(--card-background);border:1px solid rgba(var(--accent-color-rgb),.22);border-radius:999px}.about-nav a:hover{color:var(--accent-color);background:rgba(var(--accent-color-rgb),.07)}
.about-heading{display:flex;align-items:center;gap:1.2rem;margin:0 0 2.5rem;font-size:clamp(2rem,4vw,2.6rem)}.about-heading:before{width:.45rem;height:2.6rem;content:"";background:var(--accent-color);border-radius:999px}
.about-section p,.about-section li{color:var(--card-text-color-secondary);font-size:1.5rem;line-height:1.8}.about-section p:last-child{margin-bottom:0}.about-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.about-card{padding:1.5rem;background:rgba(var(--accent-color-rgb),.07);border:1px solid rgba(var(--accent-color-rgb),.16);border-radius:16px}.about-card h3{margin:0 0 .6rem;color:var(--accent-color);font-size:1.6rem}.about-card p{margin:0;font-size:1.4rem}.about-links{display:grid;gap:.8rem;margin:0;padding:0;list-style:none}.about-links a{display:flex;justify-content:space-between;gap:1rem;padding:1rem 1.2rem;color:var(--card-text-color-main);font-size:1.45rem;text-decoration:none;background:rgba(var(--accent-color-rgb),.07);border-radius:14px}.about-links a:hover{color:var(--accent-color)}.about-links span{color:var(--card-text-color-secondary);font-size:1.3rem}
@media(max-width:700px){.about-page{padding-top:.5rem}.about-grid{grid-template-columns:1fr}.about-links a{display:block}.about-links span{display:block;margin-top:.3rem}}
</style>

<main class="about-page">
<header class="about-hero"><p class="about-kicker">About · 我的名字</p><h1>我的名字</h1><p class="about-profile">一个对技术与创作充满好奇的年轻人。这个网站是我的「数字花园」：用项目记录我做过什么，用文章记录我在想什么。我崇尚把事情做好，也享受把复杂的东西讲清楚。</p></header>
<nav class="about-nav" aria-label="Page sections"><a href="#skills">Skills</a><a href="#experience">Experience</a><a href="#contact">Find me</a></nav>
<section id="skills" class="about-section"><h2 class="about-heading">Skills</h2><div class="about-grid"><article class="about-card"><h3>Programming</h3><p>Python, HTML/CSS, JavaScript, Git</p></article><article class="about-card"><h3>Design &amp; Visuals</h3><p>Figma, Photography, Graphic Layout</p></article><article class="about-card"><h3>Video Creation</h3><p>Video Editing, VFX</p></article><article class="about-card"><h3>Productivity Tools</h3><p>Office Suite, Information Research, Note Systems</p></article></div></section>
<section id="experience" class="about-section"><h2 class="about-heading">Experience</h2><ul class="about-links"><li><span>2023.09 – 2026.06</span><span>High school · Changzhou No.1 High School — started learning IT and programming, self-taught web development, joined school clubs and activities.</span></li><li><span>2026.06</span><span>Gaokao — finished the national college entrance exam and gained a clearer idea of future study direction.</span></li><li><span>2026.09 (upcoming)</span><span>Starting university — plan to study programming and design systematically and keep updating this site to record growth.</span></li></ul></section>
<section id="contact" class="about-section"><h2 class="about-heading">Find me</h2><ul class="about-links"><li><a href="https://github.com/yourname" target="_blank" rel="me noopener">GitHub <span>github.com/yourname</span></a></li><li><a href="https://space.bilibili.com/0000000" target="_blank" rel="me noopener">Bilibili <span>space.bilibili.com/0000000</span></a></li><li><a href="mailto:you@example.com">Email <span>you@example.com</span></a></li></ul></section>
</main>
