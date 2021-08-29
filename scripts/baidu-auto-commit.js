const Axios = require('axios');
const FileSystem = require('fs');

const config = {
    postDir: '../content/post',
    basePostUrl: 'https://www.kindem.xyz/post',
    targetHost: 'http://data.zz.baidu.com/urls?site=https://www.kindem.xyz&token=lDsJO81mKXxekZI6',
    fixedUrls: [
        'https://www.kindem.xyz'
    ]
};

function collectUrls() {
    const posts = FileSystem.readdirSync(config.postDir);
    return posts.map(post => `${config.basePostUrl}/${post}`).concat(config.fixedUrls);
}

function concatUrls(urls) {
    let result = '';
    urls.forEach(url => { result += `${url}\n`; });
    return result;
}

async function commitData(data) {
    try {
        const result = await Axios({
            url: config.targetHost,
            method: 'post',
            headers: {
              'Content-Type': 'plain/text'
            },
            method: 'post',
            data: data
        });
        const ret = result.data;
        console.log('commit success');
        console.log(`- success: ${ret.success}`);
        console.log(`- remain: ${ret.remain}`);
    } catch(e) {
        console.log('failed to commit');
    }
}

(async function() {
    const urls = collectUrls();
    const data = concatUrls(urls);
    await commitData(data);
})();
