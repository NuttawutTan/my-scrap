const puppeteer = require("puppeteer");
const fs = require("fs");

const thaiMonths = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.',
        'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.',
        'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];

async function parseXDCalendar() {
        // Launch the browser
    const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Open a new tab
    const page = await browser.newPage();

    // Visit the page and wait until DOM is ready (faster than networkidle2)
    await page.goto('https://www.set.or.th/th/market/stock-calendar/x-calendar', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
    });

    // Extra wait for dynamic content to render
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Interact with the DOM to retrieve the titles
    const titles = await page.evaluate(() => {
                const elements = [...document.querySelectorAll('.xd-font-color')];
                return elements.map(el => el.textContent.trim());
    });

    // ดึงข้อมูลจากหน้าแรก
    let allTitles = titles;

    // คลิกปุ่ม "ถัดไป" และดึงข้อมูลจากหน้าถัดไป
    await Promise.all([
                page.$eval('.next.btn.p-0', element => element.click()),
            ]);

    // เพิ่มการหน่วงเวลา 3 วินาที
    await new Promise(resolve => setTimeout(resolve, 3000));

    // scrape data from next page
    const nextPageTitles = await page.evaluate(() => {
                const elements = [...document.querySelectorAll('.xd-font-color')];
                return elements.map(el => el.textContent.trim());
    });

    allTitles = allTitles.concat(nextPageTitles);

    // Process the titles
    let stockData = [];
        allTitles = allTitles.filter(title => title !== "XD"); // กรอง "XD" ออก

    for (let i = 0; i < allTitles.length - 1; i += 2) {
                const stockInfo = allTitles[i].split("\n");

            if (stockInfo.length < 27) {
                            continue; // skip malformed entries
            }

            const stockName = stockInfo[0].trim();
                const fullStockName = stockInfo[4].trim();

            // Skip if the stock name contains "Depositary Receipt"
            if (fullStockName.includes("Depositary Receipt")) { continue; }

            const xdDate = stockInfo[7].trim();
                const dateParts = xdDate.split(' ');
                const day = parseInt(dateParts[0]);
                const monthIndex = thaiMonths.indexOf(dateParts[1]);
                const year = parseInt(dateParts[2]) - 543; // Convert Buddhist Era to Gregorian
            const convertedDate = new Date(year, monthIndex, day);
                const dividendAmount = parseFloat(stockInfo[26].trim());

            // Visit stock historical page with timeout and error handling
            try {
                            await page.goto(`https://www.set.or.th/th/market/product/stock/quote/${stockName}/historical-trading`, {
                                                waitUntil: 'domcontentloaded',
                                                timeout: 30000
                            });
            } catch (err) {
                            console.warn(`[SKIP] ${stockName}: page.goto timeout/error - ${err.message}`);
                            continue;
            }

            let pricesData = [];
                try {
                                pricesData = await page.evaluate(() => {
                                                    const rows = document.querySelectorAll('table tbody tr');
                                                    if (rows.length === 0) { return []; }
                                                    return Array.from(rows).map(row => {
                                                                            const cells = row.querySelectorAll('td');
                                                                            const rowData = Array.from(cells).map(cell => cell.textContent.trim());
                                                                            return rowData.filter(cell => cell !== '');
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

            const formattedPriceData = [];
                for (let j = 0; j < pricesData.length; j++) {
                                const pday = parseInt(pricesData[j][0].split(' ')[0]);
                                const pmonthIndex = thaiMonths.indexOf(pricesData[j][0].split(' ')[1]);
                                const pyear = parseInt(pricesData[j][0].split(' ')[2]) - 543;
                                const pconvertedDate = new Date(pyear, pmonthIndex, pday);
                                formattedPriceData.push({
                                                    date: pconvertedDate,
                                                    close: parseFloat(pricesData[j][4]),
                                                    volume: parseFloat(pricesData[j][7]),
                                });
                }

            console.log(`[OK] ${stockName}`);
                stockData.push({
                                stockCode: stockName,
                                stockName: fullStockName,
                                dividendDate: convertedDate,
                                dividendAmount: dividendAmount,
                                dividendPerPrice: dividendAmount * 100 / parseFloat(formattedPriceData[0].close),
                                priceData: formattedPriceData
                });
    }

    // Don't forget to close the browser instance to clean up the memory
    await browser.close();

    // Write the results to a JSON file
    fs.writeFile('dividend.json', JSON.stringify(stockData, null, 2), function (err) {
                if (err) throw err;
                console.log(`[DONE] Saved ${stockData.length} stocks to dividend.json`);
    });
}

// Export the function
module.exports = { parseXDCalendar };
