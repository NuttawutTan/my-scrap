const puppeteer = require("puppeteer");
const fs = require("fs");

const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.',
    'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.',
    'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

// Common Chrome/Chromium paths on various OS
const CHROME_PATHS = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function findChromePath() {
    for (const p of CHROME_PATHS) {
        if (fs.existsSync(p)) {
            console.log(`[INFO] Using Chrome at: ${p}`);
            return p;
        }
    }
    console.log('[INFO] Using puppeteer bundled Chrome');
    return undefined;
}

function parseDateThai(dateStr) {
    const parts = dateStr.trim().split(' ');
    if (parts.length < 3) return null;
    const day = parseInt(parts[0]);
    const monthIndex = thaiMonths.indexOf(parts[1]);
    const year = parseInt(parts[2]) - 543;
    if (isNaN(day) || monthIndex === -1 || isNaN(year)) return null;
    return new Date(year, monthIndex, day);
}

async function parseXDCalendar() {
    const executablePath = findChromePath();

    const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ]
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(45000);

    console.log('[INFO] Loading XD calendar...');
    await page.goto('https://www.set.or.th/th/market/stock-calendar/x-calendar', {
        waitUntil: 'networkidle2',
        timeout: 45000
    });

    const scrapeXDItems = () => page.evaluate(() => {
        const elements = [...document.querySelectorAll('.xd-font-color')];
        return elements.map(el => el.textContent.trim());
    });

    let allTitles = await scrapeXDItems();
    console.log(`[INFO] Page 1: ${allTitles.length} items`);

    // Click next page
    try {
        await page.$eval('.next.btn.p-0', el => el.click());
        await new Promise(resolve => setTimeout(resolve, 3000));
        const nextPageTitles = await scrapeXDItems();
        console.log(`[INFO] Page 2: ${nextPageTitles.length} items`);
        allTitles = allTitles.concat(nextPageTitles);
    } catch (err) {
        console.warn('[WARN] Could not navigate to next page:', err.message);
    }

    allTitles = allTitles.filter(title => title !== "XD");
    console.log(`[INFO] Total XD items to process: ${Math.floor(allTitles.length / 2)}`);

    const stockData = [];

    for (let i = 0; i < allTitles.length - 1; i += 2) {
        const stockInfo = allTitles[i].split("\n").map(s => s.trim()).filter(s => s !== '');

        if (stockInfo.length < 20) {
            console.warn(`[SKIP] Entry ${i}: too few fields (${stockInfo.length})`);
            continue;
        }

        const stockName = stockInfo[0];
        const fullStockName = stockInfo[4] || '';

        if (fullStockName.includes("Depositary Receipt")) continue;

        // Find XD date field (search for Thai date pattern instead of fixed index)
        let xdDate = null;
        let dividendAmount = NaN;
        for (let k = 5; k < stockInfo.length; k++) {
            const val = stockInfo[k];
            if (/^\d{1,2}\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+\d{4}$/.test(val)) {
                xdDate = val;
            }
            const num = parseFloat(val);
            if (!isNaN(num) && num > 0 && num < 100 && val.includes('.')) {
                dividendAmount = num;
            }
        }

        if (!xdDate) {
            console.warn(`[SKIP] ${stockName}: cannot find XD date`);
            continue;
        }
        if (isNaN(dividendAmount)) {
            console.warn(`[SKIP] ${stockName}: cannot find dividend amount`);
            continue;
        }

        const convertedDate = parseDateThai(xdDate);
        if (!convertedDate) {
            console.warn(`[SKIP] ${stockName}: invalid date: ${xdDate}`);
            continue;
        }

        // Fetch historical price data
        try {
            await page.goto(
                `https://www.set.or.th/th/market/product/stock/quote/${stockName}/historical-trading`,
                { waitUntil: 'domcontentloaded', timeout: 30000 }
            );
        } catch (err) {
            console.warn(`[SKIP] ${stockName}: navigation error - ${err.message}`);
            continue;
        }

        let pricesData = [];
        try {
            pricesData = await page.evaluate(() => {
                const rows = document.querySelectorAll('table tbody tr');
                return Array.from(rows).map(row => {
                    const cells = row.querySelectorAll('td');
                    return Array.from(cells).map(cell => cell.textContent.trim()).filter(c => c !== '');
                }).filter(row => row.length > 0);
            });
        } catch (err) {
            console.warn(`[SKIP] ${stockName}: evaluate error - ${err.message}`);
            continue;
        }

        if (pricesData.length === 0) {
            console.warn(`[SKIP] ${stockName}: no price data`);
            continue;
        }

        const formattedPriceData = pricesData.map(row => {
            const date = parseDateThai(row[0]);
            return {
                date: date ? date.toISOString().split('T')[0] : null,
                close: parseFloat(row[4]) || null,
                volume: parseFloat(row[7]) || null,
            };
        }).filter(d => d.date && d.close);

        if (formattedPriceData.length === 0) {
            console.warn(`[SKIP] ${stockName}: could not parse price data`);
            continue;
        }

        const latestClose = formattedPriceData[0].close;
        console.log(`[OK] ${stockName} | XD: ${xdDate} | Div: ${dividendAmount} | Price: ${latestClose}`);

        stockData.push({
            stockCode: stockName,
            stockName: fullStockName,
            dividendDate: convertedDate.toISOString().split('T')[0],
            dividendAmount: dividendAmount,
            dividendYield: parseFloat((dividendAmount * 100 / latestClose).toFixed(4)),
            priceData: formattedPriceData
        });
    }

    await browser.close();

    fs.writeFileSync('dividend.json', JSON.stringify(stockData, null, 2), 'utf8');
    console.log(`[DONE] Saved ${stockData.length} stocks to dividend.json`);
}

module.exports = { parseXDCalendar };
