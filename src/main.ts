import {configDotenv} from "dotenv";
import {google} from 'googleapis';
import {GoogleAuth} from "googleapis-common";
import {createWriteStream, PathLike} from "fs";
import {access, copyFile, mkdir, rm} from "fs/promises";
import path from "path";
import {file} from "googleapis/build/src/apis/file";

configDotenv()

const googleConfig: GoogleConfig = {
    spreadsheetId: process.env.SPREADSHEET_ID,
    skipFirstRow: true,
    projectId: process.env.PROJECT_ID,
    privateKey: process.env.SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    privateKeyId: process.env.SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    clientEmail: process.env.SERVICE_ACCOUNT_CLIENT_EMAIL
}

const redirectStatusCode = 307
const targetPath = "dist/"

async function getAuth() {
    return new google.auth.GoogleAuth({
        projectId: googleConfig.projectId,
        credentials: {
            type: 'service_account',
            private_key: googleConfig.privateKey,
            client_email: googleConfig.clientEmail
        },
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets.readonly'
        ]
    })
}

function getRange() {
    return googleConfig.skipFirstRow ? "A2:B" : "A:B";
}

async function getMapping(): Promise<Map<string, string>> {
    const sheets = google.sheets({version: "v4", auth: await getAuth()})
    return new Promise((resolve, reject) => {
        sheets.spreadsheets.values.get({
            spreadsheetId: googleConfig.spreadsheetId,
            range: getRange()
        }, ((err, res) => {
            console.log(err)
            const rows = res.data.values
            if (rows.length) {
                const map = new Map<string, string>()

                for (const [alias, target] of rows) {
                    if (alias && target) {
                        map.set(alias, target)
                    }
                }

                resolve(map)
            } else {
                console.warn("No data found in spreadsheet")
                reject()
            }
        }))
    })
}

async function pathExists(path: PathLike) : Promise<boolean> {
    try {
        await access(path)
        return true
    } catch (err: any) {
        if (err.code === 'ENOENT') return false
        throw err
    }
}

async function ensurePathExists(path: PathLike, recursive = true) {
    if (!await pathExists(path)) await mkdir(path, { recursive: recursive })
}

async function mappingToFile(mapping: Map<string, string>) {
    const fileName = "_redirects"
    await ensurePathExists(targetPath)

    const stream = createWriteStream(path.join(targetPath, fileName), { flags: "w" })

    for (const [source, target] of mapping) {
        stream.write(`/${source} ${target} ${redirectStatusCode}\n`)
    }
}

async function copyHeadersFile() {
    const fileName = "_headers"
    await copyFile(path.join("resources", fileName), path.join(targetPath, fileName))
}

async function run() {
    // Clean up dist folder
    if (await pathExists(targetPath)) {
        await rm(targetPath, { recursive: true })
    }
    const mapping = await getMapping()
    await mappingToFile(mapping)
    await copyHeadersFile()
}

run().then(() => console.log("Done."))