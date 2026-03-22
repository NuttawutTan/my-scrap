const puppeteer = require("puppeteer");
const fs = require("fs");
var count = 0;
const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.',
    'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.',
    'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

async function parseLogRocketBlogHome() {
    // Launch the browser
    const browser = await puppeteer.launch();

    // Open a new tab
    const page = await browser.newPage(); 


    // Visit the page and wait until network connections are completed
    await page.goto('https://www.set.or.th/th/market/stock-calendar/x-calendar', { waitUntil: 'networkidle2' });

    // Interact with the DOM to retrieve the titles
    const titles = await page.evaluate(() => { 
        // Select all elements with xd-font-color class 
        const elements = [...document.querySelectorAll('.xd-font-color')];
        // Map each element to its trimmed text content
        return elements.map(el => el.textContent.trim());
    });
    
    // ดึงข้อมูลจากหน้าแรก
    let allTitles = titles;

    // คลิกปุ่ม "ถัดไป" และดึงข้อมูลจากหน้าถัดไป
    await Promise.all([
        page.$eval('.next.btn.p-0', element =>
            element.click()
        ),
    ]);

    // เพิ่มการหน่วงเวลา 6 วินาที
    await new Promise(resolve => setTimeout(resolve, 3000));
    // scrape data from next page
    const nextPageTitles = await page.evaluate(() => {
        const elements = [...document.querySelectorAll('.xd-font-color')];
        return elements.map(el => el.textContent.trim());
    });
    allTitles = allTitles.concat(nextPageTitles);
    allTitles.forEach(title => console.log(`- ${title}`));

    // Don't forget to close the browser instance to clean up the memory
    await browser.close();

    
    // Process the titles
    let stockData = [];
    allTitles = allTitles.filter(title => title !== "XD"); // กรอง "XD" ออก
    for (let i = 0; i < allTitles.length - 1; i += 2) {
        const stockInfo = allTitles[i].split("\n");
        const stockName = stockInfo[0].trim()
        const fullStockName = stockInfo[4].trim();
        // Skip if the stock name contains "Depositary Receipt"
        if (fullStockName.includes("Depositary Receipt")) {continue}
        const xdDate = stockInfo[8].trim();
        const dateParts = xdDate.split(' ');
        const day = parseInt(dateParts[0]);
        const monthIndex = thaiMonths.indexOf(dateParts[1]);
        const year = parseInt(dateParts[2]) - 543; // Convert Buddhist Era to Gregorian
        const convertedDate = new Date(year, monthIndex, day);
        const formattedDate = `${String(day).padStart(2, '0')} ${thaiMonths[monthIndex]} ${year + 543}`;
        const dividendAmount = stockInfo[28].trim();
        
        stockData.push({
            stockCode: stockName,
            stockName: fullStockName,
            dividendDate: convertedDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
            dividendAmount: dividendAmount
        });
    }

    // Write the results to a JSON file
    fs.writeFile('dividend.json', JSON.stringify(stockData, null, 2), function (err) {
        if (err) throw err;
        console.log('Saved!');
    });
}

parseLogRocketBlogHome();