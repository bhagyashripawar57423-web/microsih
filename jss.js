/* script.js
   - Updates charts to compare images
   - Maintains history (in-memory) and exports CSV / printable report
*/

const fileInput = document.getElementById("fileInput");
const imageGrid = document.getElementById("imageGrid");
const historyTableBody = document.querySelector("#historyTable tbody");

const downloadCsvBtn = document.getElementById("downloadCsv");
const printReportBtn = document.getElementById("printReport");

// microplastic types & colors
const TYPES = ["Fiber", "Fragment", "Pellet", "Microbead"];
const COLORS = ["#3b82f6", "#f97316", "#22c55e", "#a855f7"];
const SIZE_BUCKETS = ["<10 µm", "10-50 µm", "50-100 µm", ">100 µm"];

// in-memory history of all analyzed images
const allImages = []; // each item: {name, shortName, counts:[4], size, accuracy}

// --- Chart.js initialization ---
// Composition chart (stacked bar): each bar = one image; stacks = counts per type
const compCtx = document.getElementById("compositionChart").getContext("2d");
const compositionChart = new Chart(compCtx, {
  type: "bar",
  data: {
    labels: [], // image short names
    datasets: TYPES.map((t, i) => ({
      label: t,
      data: [],
      backgroundColor: COLORS[i],
    })),
  },
  options: {
    plugins: { legend: { position: "top" } },
    responsive: true,
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, title: { display: true, text: "Count" } }
    }
  }
});

// Accuracy chart (line): accuracy per image
const accCtx = document.getElementById("accuracyChart").getContext("2d");
const accuracyChart = new Chart(accCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Accuracy (%)",
      data: [],
      borderColor: "#ef4444",
      backgroundColor: "rgba(239,68,68,0.08)",
      tension: 0.2,
      fill: true,
      pointRadius: 5
    }]
  },
  options: {
    responsive: true,
    scales: { y: { beginAtZero: true, suggestedMax: 100, title: { display: true, text: "Accuracy (%)" } } }
  }
});

// helper: short name for charts (truncates if long)
function shortName(name) {
  return name.length > 18 ? name.slice(0, 15) + "..." : name;
}

// update charts from allImages
function updateCharts() {
  const labels = allImages.map(i => i.shortName);
  compositionChart.data.labels = labels;
  // update datasets for each type
  compositionChart.data.datasets.forEach((ds, typeIndex) => {
    ds.data = allImages.map(img => img.counts[typeIndex]);
  });
  compositionChart.update();

  accuracyChart.data.labels = labels;
  accuracyChart.data.datasets[0].data = allImages.map(img => Number(img.accuracy));
  accuracyChart.update();
}

// add a row to history table
function addHistoryRow(imgObj) {
  const tr = document.createElement("tr");
  const domTypeIndex = imgObj.counts.indexOf(Math.max(...imgObj.counts));
  const domType = TYPES[domTypeIndex] || "Unknown";

  tr.innerHTML = `
    <td>${imgObj.name}</td>
    <td>${domType}</td>
    <td>${imgObj.size}</td>
    <td>${imgObj.accuracy}%</td>
  `;
  historyTableBody.appendChild(tr);
}

// generate a fake detection result for an image
function fakeDetection(fileName) {
  // random counts per type (0-5)
  const counts = Array.from({length: TYPES.length}, () => Math.floor(Math.random() * 6));
  if (counts.reduce((a,b)=>a+b,0) === 0) counts[0] = 1; // ensure at least 1 detection

  // random size bucket
  const size = SIZE_BUCKETS[Math.floor(Math.random() * SIZE_BUCKETS.length)];

  // random accuracy 70-99
  const accuracy = (70 + Math.random() * 29).toFixed(1);

  return { counts, size, accuracy };
}

// handle file upload: generate fake detections and update UI/history/charts
fileInput.addEventListener("change", () => {
  const files = Array.from(fileInput.files);
  if (!files.length) return;

  files.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // create fake detection for this image
      const det = fakeDetection(file.name);

      // create image card
      const card = document.createElement("div");
      card.className = "card";
      const short = shortName(file.name);
      card.innerHTML = `
        <img src="${e.target.result}" alt="${short}" />
        <h3>${short}</h3>
        <p class="result">Dominant Type: <strong>${TYPES[det.counts.indexOf(Math.max(...det.counts))]}</strong></p>
        <p class="result">Size: <em>${det.size}</em></p>
        <p class="result accuracy">${det.accuracy}%</p>
        <p class="result" style="font-size:12px;color:#6b7280;margin-top:6px">Counts: ${det.counts.join(", ")}</p>
      `;
      imageGrid.prepend(card); // newest first

      // add to in-memory history & DOM table
      const imgObj = {
        name: file.name,
        shortName: short,
        counts: det.counts,
        size: det.size,
        accuracy: det.accuracy
      };
      allImages.push(imgObj);
      addHistoryRow(imgObj);

      // update charts with a small delay to ensure all files processed
      setTimeout(updateCharts, 100);
    };

    reader.readAsDataURL(file);
  });

  // clear input so same files can be re-uploaded if needed
  fileInput.value = "";
});


// --- CSV download ---
function downloadCSV() {
  if (allImages.length === 0) {
    alert("No history to download.");
    return;
  }

  // header: Name, DominantType, Size, Accuracy, counts per type...
  const header = ["Image", "DominantType", "Size", "Accuracy", ...TYPES];
  const rows = [header];

  allImages.forEach(img => {
    const domType = TYPES[img.counts.indexOf(Math.max(...img.counts))];
    const row = [img.name, domType, img.size, img.accuracy + "%", ...img.counts];
    rows.push(row);
  });

  const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "microplastics_history.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

downloadCsvBtn?.addEventListener("click", downloadCSV);

// --- Print / PDF (opens print dialog; user can Save as PDF) ---
function printReport() {
  if (allImages.length === 0) {
    alert("No history to print.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return alert("Popup blocked. Allow popups and try again.");

  // simple styling for printed table
  const style = `
    <style>
      body{ font-family: Arial, sans-serif; padding:20px; color: #111 }
      h1{ font-size:18px; margin-bottom:8px }
      table{ width:100%; border-collapse:collapse; margin-top:12px }
      th,td{ border:1px solid #ccc; padding:8px; text-align:center }
      th{ background:#3b82f6; color:#fff }
    </style>`;

  // create table HTML identical to history table plus counts details
  let rowsHtml = '';
  allImages.forEach(img => {
    const domType = TYPES[img.counts.indexOf(Math.max(...img.counts))];
    rowsHtml += `<tr>
      <td>${img.name}</td>
      <td>${domType}</td>
      <td>${img.size}</td>
      <td>${img.accuracy}%</td>
    </tr>`;
  });

  const html = `
    <!doctype html>
    <html>
      <head><meta charset="utf-8">${style}</head>
      <body>
        <h1>Microplastic Detection Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr><th>Image</th><th>Dominant Type</th><th>Size</th><th>Accuracy</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  // allow render then call print
  setTimeout(() => { printWindow.print(); }, 400);
}

printReportBtn?.addEventListener("click", printReport);

// --- Tab navigation ---
document.querySelectorAll("nav a").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll("nav a").forEach(a => a.classList.remove("active"));
    link.classList.add("active");
    const tab = link.getAttribute("data-tab");
    document.querySelectorAll(".tab-content").forEach(sec => sec.classList.remove("active"));
    document.getElementById(tab).classList.add("active");
  });
});
