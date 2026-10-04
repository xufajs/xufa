// Type tests of what @xufa/boot exports besides the function (not ported: kept by tools/port-types).
import boot from '../../'

const app = boot.Boot({ name: 'app' })
const err: typeof boot.errors = boot.errors
const symbol: symbol = boot.kBoot
const meta: symbol = boot.kPluginMeta
const timeout = new boot.errors.BOOT_ERR_READY_TIMEOUT('plugin')
const code: 'BOOT_ERR_READY_TIMEOUT' = timeout.code
app.use(async () => {})
void [err, symbol, meta, code]
