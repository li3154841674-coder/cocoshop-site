import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

type CreatePaymentRequestBody = {
  title?: string
  totalFee?: number | string
  paymentMethod?: 'alipay' | 'wechat'
  shippingName?: string
  shippingPhone?: string
  shippingAddress?: string
  tshirtColor?: string
  generatedImageUrl?: string
  size?: string
}

// 生成随机字符串
function generateNonceStr(): string {
  let result = ''
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const charactersLength = characters.length
  for (let i = 0; i < 16; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

// 虎皮椒签名算法
function generateSign(params: Record<string, string>, appSecret: string): string {
  const sortedKeys = Object.keys(params).sort()
  const signString = sortedKeys.map((key) => `${key}=${params[key]}`).join('&') + appSecret
  console.log('>>> [签名] 传入的 AppID:', params.appid)
  console.log('>>> [签名] 准备进行加密签名的原始字符串:', signString)
  return crypto.createHash('md5').update(signString).digest('hex').toLowerCase()
}

// 数据库入库核心逻辑
async function insertPendingOrder(params: {
  title: string
  totalFee: number
  paymentMethod: 'alipay' | 'wechat'
  shippingName?: string
  shippingPhone?: string
  shippingAddress?: string
  tshirtColor?: string
  generatedImageUrl?: string
  size?: string
}) {
  const supabaseAdmin = getSupabaseAdmin()

  // 极其严谨的下划线字段映射
  const dbData = {
    title: params.title || '观象高定宠物服装',
    total_fee: Number(params.totalFee) || 69.90,
    amount: Number(params.totalFee) || 69.90, // 双重保险，防止某些表结构必填 amount
    payment_method: params.paymentMethod || 'wechat',
    customer_name: params.shippingName || '未提供',
    phone: params.shippingPhone || '未提供',
    address: params.shippingAddress || '未提供',
    pet_size: params.size || '默认尺寸',
    tshirt_color: params.tshirtColor || '默认颜色',
    image_url: params.generatedImageUrl || '',
    status: 'pending',
    payment_status: 'pending'
  }

  console.log('>>> [数据库] 准备入库的终极数据:', dbData)

  const { data, error: insertError } = await (supabaseAdmin as any)
    .from('orders')
    .insert([dbData])
    .select('id')
    .single() // 强制要求返回单个对象，避免拿到数组导致取不到 ID

  if (insertError) {
    console.error('>>> [数据库] 致命插入错误详细信息:', insertError)
    throw new Error(insertError.message || 'Unknown insert error')
  }

  const orderId = data?.id
  if (!orderId) {
    throw new Error('插入数据库似乎成功了，但没有返回有效的 orderId！')
  }

  return { orderId }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.clone().json().catch(() => ({}))
    console.log(">>> [API] 1. 收到前端请求参数:", rawBody)
    
    const body = rawBody as CreatePaymentRequestBody

    // 参数清理与安全转换
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '观象高定宠物服装'
    const totalFeeNumber = typeof body.totalFee === 'string' ? Number(body.totalFee) : body.totalFee
    const totalFee = Number.isFinite(totalFeeNumber) && totalFeeNumber! > 0 ? totalFeeNumber! : 69.9
    const paymentMethod = body.paymentMethod === 'wechat' ? 'wechat' : 'alipay'
    const shippingName = typeof body.shippingName === 'string' ? body.shippingName.trim() : ''
    const shippingPhone = typeof body.shippingPhone === 'string' ? body.shippingPhone.trim() : ''
    const shippingAddress = typeof body.shippingAddress === 'string' ? body.shippingAddress.trim() : ''
    const tshirtColor = typeof body.tshirtColor === 'string' ? body.tshirtColor.trim() : ''
    const generatedImageUrl = typeof body.generatedImageUrl === 'string' ? body.generatedImageUrl.trim() : ''
    const size = typeof body.size === 'string' ? body.size.trim() : ''

    const isWechat = paymentMethod === 'wechat'

    // 虎皮椒秘钥动态获取
    const appId = isWechat 
      ? (process.env.XUNHU_WECHAT_APPID || '201906178106') 
      : (process.env.XUNHU_ALIPAY_APPID || process.env.XUNHU_APPID || '201906178015')

    const appSecret = isWechat 
      ? (process.env.XUNHU_WECHAT_APPSECRET || 'd76c3974288973a601f5cd5d69eb273a')
      : (process.env.XUNHU_ALIPAY_APPSECRET || process.env.XUNHU_APPSECRET || '23e102d4ba120f878006356ae4f6d27c')
    
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://116.62.205.228' // 增加保底 IP
    const gateway = process.env.XUNHU_GATEWAY || 'https://api.xunhupay.com/payment/do.html'

    console.log(">>> [API] 2. 环境检查 | SupabaseKey:", !!process.env.SUPABASE_SERVICE_ROLE_KEY, "| AppID:", appId)

    if (!appSecret) {
      return NextResponse.json({ errcode: -1, error: '支付密钥未配置' }, { status: 500 })
    }

    let orderId: string
    try {
      console.log(">>> [API] 3. 正在呼叫数据库入库函数...")
      const inserted = await insertPendingOrder({
        title, totalFee, paymentMethod, shippingName, shippingPhone,
        shippingAddress, tshirtColor, generatedImageUrl, size,
      })
      orderId = inserted.orderId
      console.log(">>> [API] 4. 数据库写入成功，拿到的订单ID:", orderId)
    } catch (insertError) {
      console.error("❌ [API] 数据库环节彻底崩溃:", insertError)
      return NextResponse.json({ 
        errcode: -11, 
        errmsg: insertError instanceof Error ? insertError.message : String(insertError), 
        error: '创建订单写库失败' 
      }, { status: 500 })
    }

    // 组装发给虎皮椒的参数
    const params: Record<string, string> = {
      appid: appId,
      trade_order_id: orderId,
      total_fee: totalFee.toFixed(2),
      title,
      time: Math.floor(Date.now() / 1000).toString(),
      notify_url: `${siteUrl}/api/payment/notify`,
      return_url: `${siteUrl}/`,
      nonce_str: generateNonceStr(),
      type: paymentMethod,
    }

    params.hash = generateSign(params, appSecret)

    console.log(">>> [API] 5. 准备发送给虎皮椒的参数:", params)

    const upstreamRes = await fetch(gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })

    const responseText = await upstreamRes.text()
    if (!upstreamRes.ok) {
      return NextResponse.json({ errcode: upstreamRes.status, error: '虎皮椒网关报错', errmsg: responseText, orderId }, { status: 502 })
    }

    let upstream = JSON.parse(responseText)
    const url = upstream?.url || upstream?.paymentUrl

    console.log(">>> [API] 6. 虎皮椒返回成功！支付链接:", url)

    return NextResponse.json({ errcode: upstream.errcode || 0, url, paymentUrl: url, orderId })
  } catch (error) {
    console.error("❌ [API] 全局致命崩溃:", error)
    return NextResponse.json({ 
      errcode: -1, 
      errmsg: error instanceof Error ? error.message : String(error), 
      error: '服务器内部处理失败' 
    }, { status: 500 })
  }
}