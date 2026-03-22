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
    await page.goto('https://www.set.or.th/th/market/product/stock/quote/SAT/historical-trading', { waitUntil: 'networkidle2' });
    
    // Interact with the DOM to retrieve the pricesData
    const pricesData = await page.evaluate(() => { 
        // เลือกทุกแถวในตารางที่มีข้อมูล
        
        const rows = document.querySelectorAll('table tbody tr');
        if (rows.length === 0) {
            return [];
        }
        return Array.from(rows).map(row => {
            const cells = row.querySelectorAll('td');
            const rowData = Array.from(cells).map(cell => cell.textContent.trim());
            // กรองข้อมูลที่ว่างเปล่าออก
            return rowData.filter(cell => cell !== '');
        }).filter(row => row.length > 0); // กรองแถวที่ว่างเปล่าออก
    });

    // Don't forget to close the browser instance to clean up the memory
    await browser.close();
    
    if (pricesData.length === 0) {
        console.log('ไม่พบข้อมูลในตาราง');
    } else {
        console.log('ข้อมูลที่ได้:');
        pricesData.forEach(row => console.log(row));
    }
}

parseLogRocketBlogHome();