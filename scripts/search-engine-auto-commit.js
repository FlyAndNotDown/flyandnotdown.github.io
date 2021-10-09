const Axios = require('axios');
const FileSystem = require('fs');

const config = {
    postDir: 'content/post',
    site: "https://www.kindem.xyz",
    basePostUrl: 'https://www.kindem.xyz/post',
    prefabUrls: [
        'https://www.kindem.xyz'
    ],
    searchEngines: {
        baidu: {
            host: 'http://data.zz.baidu.com/urls?site=https://www.kindem.xyz&token=lDsJO81mKXxekZI6',
            format: 'baidu',
            method: 'post',
            contentType: 'plain/text'
        },
        bing: {
            host: 'https://ssl.bing.com​/webmaster/api.svc/json/SubmitUrlbatch?apikey=5d1b26832e234f45ab21549ba6fb2769',
            format: 'bing',
            method: 'post',
            contentType: 'application/json'
        }
    },
};

function collectUrls() {
    const posts = FileSystem.readdirSync(config.postDir).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    return posts.map(post => `${config.basePostUrl}/${post}`).concat(config.prefabUrls);
}

function getContentWithBaiduFormat(urls) {
    let result = '';
    urls.forEach(url => { result += `${url}\n`; });
    return result;
}

function getContentWithBingFormat(urls) {
    return {
        siteUrl: config.site,
        urlList: urls.splice(0, 10)
    };
}

function getContent(searchEngine, urls) {
    if (searchEngine == 'baidu') {
        return getContentWithBaiduFormat(urls);
    } else if (searchEngine == 'bing') {
        return getContentWithBingFormat(urls);
    }
}

function dealWithResponseWithBaiduFormat(data) {
    console.log('commit success')
    console.log(`- success: ${data.success}`);
    console.log(`- remain: ${data.remain}`);
}

function dealWithResponseWithBingFormat(data) {
    console.log('commit success');
    console.log(`- d: ${data.d}`);
}

function dealWithResponse(searchEngine, data) {
    if (searchEngine == 'baidu') {
        return dealWithResponseWithBaiduFormat(data);
    } else if (searchEngine == 'bing') {
        return dealWithResponseWithBingFormat(data);
    }
}

async function commitData(urls) {
    for (const key in config.searchEngines) {
        console.log(`staring commit data to ${key}`);
        try {``
            const result = await Axios({
                url: config.searchEngines[key].host,
                method: config.searchEngines[key].method,
                headers: {
                  'Content-Type': config.searchEngines[key].contentType
                },
                data: getContent(key, urls)
            });
            dealWithResponse(key, result.data);
        } catch(e) {
            console.log('failed to commit');
            console.log(e);
        }
    }
}

(async function() {
    const urls = collectUrls();
    await commitData(urls);
})();
