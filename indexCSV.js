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

    // Don't forget to close the browser instance to clean up the memory
    await browser.close();

    // Process the titles
    let csvContent = "Stock Code,Stock Name,Dividend Date,Dividend Amount\n";
    for (let i = 0; i < titles.length-2; i += 3) {
        const stockData = titles[i].split("\n");
        const stockName = stockData[0].trim()
        const xdDate = stockData[8].trim();
        const dateParts = xdDate.split(' ');
        const day = parseInt(dateParts[0]);
        const monthIndex = thaiMonths.indexOf(dateParts[1]);
        const year = parseInt(dateParts[2]) - 543; // Convert Buddhist Era to Gregorian
        const convertedDate = new Date(year, monthIndex, day);
        const formattedDate = `${String(day).padStart(2, '0')} ${thaiMonths[monthIndex]} ${year + 543}`;
        const dividendAmount = stockData[28].trim();
        csvContent += `${stockName},${stockData[4].trim()},${convertedDate},${dividendAmount}\n`;
    }

    // Write the results to a CSV file
    fs.writeFile('dividend.csv', csvContent, function (err) {
        if (err) throw err;
        console.log('Saved!');
    });
}

parseLogRocketBlogHome();