(() => {
  const STORAGE_AXIS_KEY = 'calcretifica_spindle_axis';
  const STORAGE_HISTORY_KEY = 'calcretifica_history';

  // Elementos do DOM
  const form = document.getElementById('calcForm');
  const spindleInput = document.getElementById('spindleDiam');
  const currentInput = document.getElementById('currentDiam');
  const targetInput = document.getElementById('targetDiam');
  const honingInput = document.getElementById('honingAllowance');
  const maxCutInput = document.getElementById('maxCut');
  const cutBasisSelect = document.getElementById('cutBasis');
  const errorBox = document.getElementById('errorBox');

  // Saídas
  const passModeBadge = document.getElementById('passModeBadge');
  const resFinalToolSet = document.getElementById('resFinalToolSet');
  const toolStepsStrip = document.getElementById('toolStepsStrip');
  const formulaBreakdown = document.getElementById('formulaBreakdown');
  const resTargetBore = document.getElementById('resTargetBore');
  const resTotalRemoval = document.getElementById('resTotalRemoval');
  const resTotalPasses = document.getElementById('resTotalPasses');
  const passRuleBadge = document.getElementById('passRuleBadge');
  const passesBody = document.getElementById('passesBody');
  const historyList = document.getElementById('historyList');

  // Botões auxiliares
  const btnCopyTool = document.getElementById('btnCopyTool');
  const copyLabel = document.getElementById('copyLabel');
  const btnReset = document.getElementById('btnReset');
  const btnClearHistory = document.getElementById('btnClearHistory');

  let lastToolValue = '1.280';

  function fmt(num, decimals = 3) {
    return Number(num).toFixed(decimals);
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function loadSavedAxis() {
    const savedAxis = localStorage.getItem(STORAGE_AXIS_KEY);
    if (savedAxis && !isNaN(parseFloat(savedAxis))) {
      spindleInput.value = parseFloat(savedAxis).toFixed(2);
      updateActiveAxisChip(parseFloat(savedAxis));
    }
  }

  function updateActiveAxisChip(val) {
    document.querySelectorAll('[data-axis]').forEach((btn) => {
      const chipVal = parseFloat(btn.dataset.axis);
      btn.classList.toggle('active', Math.abs(chipVal - val) < 0.0001);
    });
  }

  function updateActiveHoneChip(val) {
    document.querySelectorAll('[data-hone]').forEach((btn) => {
      const chipVal = parseFloat(btn.dataset.hone);
      btn.classList.toggle('active', Math.abs(chipVal - val) < 0.0001);
    });
  }

  function calculate(saveToHistory = false) {
    hideError();

    const spindleDiam = parseFloat(spindleInput.value);
    const currentDiam = parseFloat(currentInput.value);
    const targetDiam = parseFloat(targetInput.value);
    const honing = parseFloat(honingInput.value);
    const rawMaxCut = parseFloat(maxCutInput.value);
    const cutBasis = cutBasisSelect.value;

    if ([spindleDiam, currentDiam, targetDiam, honing, rawMaxCut].some((v) => isNaN(v))) {
      showError('Preencha todos os campos numéricos corretamente.');
      return;
    }

    if (spindleDiam <= 0 || currentDiam <= 0 || targetDiam <= 0) {
      showError('As medidas de diâmetro devem ser maiores que zero.');
      return;
    }

    if (honing < 0) {
      showError('O sobremetal de brunimento não pode ser negativo.');
      return;
    }

    if (rawMaxCut <= 0) {
      showError('O corte máximo por passe deve ser maior que zero.');
      return;
    }

    const targetBoreDiam = targetDiam - honing;

    if (currentDiam < spindleDiam) {
      showError(
        `Atenção: o cilindro atual (${fmt(currentDiam, 2)} mm) é menor que o eixo da máquina (${fmt(spindleDiam, 2)} mm).`
      );
      return;
    }

    if (targetBoreDiam <= currentDiam) {
      showError(
        `O Ø alvo (${fmt(targetBoreDiam)} mm) deve ser maior que o cilindro atual (${fmt(currentDiam)} mm).`
      );
      return;
    }

    localStorage.setItem(STORAGE_AXIS_KEY, spindleDiam.toString());

    // Converte corte máximo para diâmetro
    const maxDiamCutPerPass = cutBasis === 'radius' ? rawMaxCut * 2 : rawMaxCut;
    const totalDiamRemoval = targetBoreDiam - currentDiam;

    // Se o total couber dentro do corte máximo (com tolerância de ponto flutuante), faz em 1 passe único!
    const eps = 1e-6;
    const passes = [];

    if (totalDiamRemoval <= maxDiamCutPerPass + eps) {
      const toolSet = (targetBoreDiam - spindleDiam) / 2;
      passes.push({
        number: 1,
        type: 'Passe Único',
        isFinish: true,
        boreDiam: targetBoreDiam,
        diamCut: totalDiamRemoval,
        toolSet,
      });
    } else {
      // Precisa de mais passes: tira o corte máximo nos passes de desbaste e o restante no passe final
      let remaining = totalDiamRemoval;
      let prevDiam = currentDiam;
      let passNum = 1;

      while (remaining > eps) {
        const isLast = remaining <= maxDiamCutPerPass + eps;
        const diamCut = isLast ? remaining : maxDiamCutPerPass;
        const nextDiam = prevDiam + diamCut;
        const toolSet = (nextDiam - spindleDiam) / 2;

        passes.push({
          number: passNum,
          type: isLast ? 'Passe Final' : 'Desbaste',
          isFinish: isLast,
          boreDiam: nextDiam,
          diamCut,
          toolSet,
        });

        remaining -= diamCut;
        prevDiam = nextDiam;
        passNum++;
      }
    }

    const numPasses = passes.length;
    const finalPass = passes[numPasses - 1];
    const diffFromSpindle = targetBoreDiam - spindleDiam;
    lastToolValue = fmt(finalPass.toolSet, 3);

    // Atualiza Destaque Principal
    resFinalToolSet.textContent = lastToolValue;

    if (numPasses === 1) {
      passModeBadge.textContent = '1 PASSE ÚNICO (DENTRO DO LIMITE)';
      passModeBadge.className = 'mode-badge mode-single';
      toolStepsStrip.innerHTML = `
        <div class="step-pill is-final">
          <span class="step-pill-label">Regulagem Direta na Ferramenta</span>
          <span class="step-pill-val">${lastToolValue} mm</span>
        </div>
      `;
    } else {
      passModeBadge.textContent = `NECESSÁRIO ${numPasses} PASSES`;
      passModeBadge.className = 'mode-badge mode-multi';
      toolStepsStrip.innerHTML = passes
        .map(
          (p) => `
          <div class="step-pill ${p.isFinish ? 'is-final' : ''}">
            <span class="step-pill-label">${p.number}º Passe (${p.type})</span>
            <span class="step-pill-val">${fmt(p.toolSet)} mm</span>
          </div>
        `
        )
        .join('');
    }

    formulaBreakdown.innerHTML = `(Ø ${fmt(targetBoreDiam)} - Ø ${fmt(spindleDiam)}) = ${fmt(diffFromSpindle)} ÷ 2 = <strong>${lastToolValue} mm</strong> na ferramenta`;

    resTargetBore.textContent = `${fmt(targetBoreDiam)} mm`;
    resTotalRemoval.textContent = `${fmt(totalDiamRemoval)} mm`;
    resTotalPasses.textContent = `${numPasses} ${numPasses === 1 ? 'passe' : 'passes'}`;
    passRuleBadge.textContent = `Limite: ${fmt(maxDiamCutPerPass)} mm no Ø (${fmt(maxDiamCutPerPass / 2)} mm raio)`;

    // Renderiza Tabela
    passesBody.innerHTML = passes
      .map(
        (p) => `
        <tr>
          <td>#${p.number}</td>
          <td><span class="tag ${p.isFinish ? 'tag-finish' : 'tag-rough'}">${p.type}</span></td>
          <td>${fmt(p.boreDiam)} mm</td>
          <td>+${fmt(p.diamCut)} mm</td>
          <td class="tool-set-cell">${fmt(p.toolSet)} mm</td>
        </tr>
      `
      )
      .join('');

    if (saveToHistory) {
      addHistoryEntry({
        spindleDiam,
        currentDiam,
        targetDiam,
        honing,
        rawMaxCut,
        cutBasis,
        targetBoreDiam,
        finalTool: lastToolValue,
        passesCount: numPasses,
      });
    }
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function addHistoryEntry(entry) {
    const list = getHistory();
    list.unshift({ ...entry, id: Date.now() });
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(list.slice(0, 8)));
    renderHistory();
  }

  function renderHistory() {
    const list = getHistory();
    if (!list.length) {
      historyList.innerHTML = '<p class="empty-msg">Nenhum cálculo salvo ainda.</p>';
      return;
    }

    historyList.innerHTML = list
      .map(
        (item, idx) => `
        <div class="history-item" data-history-idx="${idx}" title="Clique para carregar estes valores">
          <div>
            <div class="history-main">Ø ${fmt(item.currentDiam, 2)} → ${fmt(item.targetDiam, 2)} mm (Alvo ${fmt(item.targetBoreDiam, 2)})</div>
            <div class="history-sub">Eixo ${fmt(item.spindleDiam, 2)} mm • Brunim. ${fmt(item.honing, 2)} mm • ${item.passesCount} passe(s)</div>
          </div>
          <div class="history-tool">${item.finalTool} mm</div>
        </div>
      `
      )
      .join('');
  }

  // Eventos
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    calculate(true);
  });

  // Recalcula automaticamente ao alterar qualquer campo
  [spindleInput, currentInput, targetInput, honingInput, maxCutInput, cutBasisSelect].forEach((el) => {
    el.addEventListener('input', () => calculate(false));
    el.addEventListener('change', () => calculate(false));
  });

  document.querySelectorAll('[data-axis]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = parseFloat(btn.dataset.axis);
      spindleInput.value = val.toFixed(2);
      updateActiveAxisChip(val);
      calculate(false);
    });
  });

  spindleInput.addEventListener('input', () => {
    updateActiveAxisChip(parseFloat(spindleInput.value));
  });

  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const base = parseFloat(currentInput.value);
      const add = parseFloat(btn.dataset.add);
      if (!isNaN(base)) {
        targetInput.value = (base + add).toFixed(2);
        calculate(false);
      }
    });
  });

  document.querySelectorAll('[data-hone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = parseFloat(btn.dataset.hone);
      honingInput.value = val.toFixed(2);
      updateActiveHoneChip(val);
      calculate(false);
    });
  });

  honingInput.addEventListener('input', () => {
    updateActiveHoneChip(parseFloat(honingInput.value));
  });

  btnCopyTool.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(lastToolValue);
      copyLabel.textContent = 'Copiado!';
      setTimeout(() => {
        copyLabel.textContent = 'Copiar';
      }, 1600);
    } catch {
      copyLabel.textContent = lastToolValue;
    }
  });

  btnReset.addEventListener('click', () => {
    currentInput.value = '';
    targetInput.value = '';
    hideError();
    currentInput.focus();
  });

  btnClearHistory.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_HISTORY_KEY);
    renderHistory();
  });

  historyList.addEventListener('click', (e) => {
    const itemEl = e.target.closest('[data-history-idx]');
    if (!itemEl) return;

    const list = getHistory();
    const item = list[Number(itemEl.dataset.historyIdx)];
    if (!item) return;

    spindleInput.value = item.spindleDiam.toFixed(2);
    currentInput.value = item.currentDiam.toFixed(2);
    targetInput.value = item.targetDiam.toFixed(2);
    honingInput.value = item.honing.toFixed(2);
    maxCutInput.value = item.rawMaxCut.toFixed(2);
    cutBasisSelect.value = item.cutBasis || 'diameter';

    updateActiveAxisChip(item.spindleDiam);
    updateActiveHoneChip(item.honing);
    calculate(false);
  });

  loadSavedAxis();
  renderHistory();
  calculate(false);
})();