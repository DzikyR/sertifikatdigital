// Tooltip grafik dashboard (hover & fokus keyboard)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-chart]').forEach((chart) => {
    const tip = chart.querySelector('[data-chart-tip]');
    const show = (g) => {
      const [title, ...rows] = g.dataset.tip.split('|');
      tip.replaceChildren();
      const h = document.createElement('p');
      h.className = 'font-semibold text-slate-900';
      h.textContent = title;
      tip.appendChild(h);
      rows.forEach((r) => {
        const p = document.createElement('p');
        p.className = 'tabular-nums text-slate-600';
        p.textContent = r;
        tip.appendChild(p);
      });
      const box = g.getBoundingClientRect();
      const host = chart.getBoundingClientRect();
      tip.classList.remove('hidden');
      const left = Math.min(Math.max(box.left - host.left + box.width / 2 - tip.offsetWidth / 2, 0), host.width - tip.offsetWidth);
      tip.style.left = `${left}px`;
      tip.style.top = '0px';
    };
    const hide = () => tip.classList.add('hidden');
    chart.querySelectorAll('[data-tip]').forEach((g) => {
      g.addEventListener('mouseenter', () => show(g));
      g.addEventListener('focus', () => show(g));
      g.addEventListener('mouseleave', hide);
      g.addEventListener('blur', hide);
    });
  });
});
