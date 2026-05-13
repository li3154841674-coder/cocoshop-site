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

function generateNonceStr(): string {
 let result = ''
 const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
 const charactersLength = characters.length
 for (let i = 0; i < 16; i++) {
   result += characters.charAt(Math.floor(Math.random() * charactersLength))
 }
 return result
}

function generateSign(params: Record<string, string>, appSecret: string): string {
 const sortedKeys = Object.keys(params).sort()
 const signString = sortedKeys.map((key) => `${key}=${params[key]}`).join('&') + appSecret
 console.log('传入的 AppID:', params.appid)
 console.log('准备进行加密签名的原始字符串:', signString)
 return crypto.createHash('md5').update(signString).digest('hex').toLowerCase()
}

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
 const {
   title,
   totalFee,
   paymentMethod,
   shippingName,
   shippingPhone,
   shippingAddress,
   tshirtColor,
   generatedImageUrl,
   size,
 } = params

 const supabaseAdmin = getSupabaseAdmin()

 const dbData = {
   title: params.title || '观象高定宠物服装',
   total_fee: Number(params.totalFee) || 69.9,
   amount: Number(params.totalFee) || 69.9,
   payment_method: params.paymentMethod || 'wechat',
   customer_name: params.shippingName,
   phone: params.shippingPhone,
   address: params.shippingAddress,
   pet_size: params.size,
   tshirt_color: params.tshirtColor,
   image_url: params.generatedImageUrl,
   status: 'pending',
   payment_status: 'pending'
 }

 console.log('[雷达 3b] 数据库映射后的字段:', dbData)

 const { data, error: insertError } = await (supabaseAdmin as any)
   .from('orders')
   .insert([dbData])
   .select('id')
   .maybeSingle()

 if (insertError) {
   throw new Error(insertError.message || 'Unknown insert error')
 }

 const orderId = data?.id
 if (!orderId) {
   throw new Error('Insert order succeeded but id missing from response.')
 }

 return { orderId }
}

export async function POST(request: NextRequest) {
 try {
   console.log("[雷达 1] 开始接收前端请求参数:", await request.clone().json().catch(() => ({})))
   const body = (await request.json().catch(() => ({}))) as CreatePaymentRequestBody

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

   // 1. 精准判断是否为微信支付
   const isWechat = paymentMethod === 'wechat'

   // 2. 根据支付方式，动态选择对应的 AppID (优先读取环境变量，保底使用硬编码)
   const appId = isWechat 
     ? (process.env.XUNHU_WECHAT_APPID || '201906178106') 
     : (process.env.XUNHU_ALIPAY_APPID || process.env.XUNHU_APPID || '201906178015')

   // 3. 根据支付方式，动态选择对应的 AppSecret (优先读取环境变量，保底使用硬编码)
   const appSecret = isWechat 
     ? (process.env.XUNHU_WECHAT_APPSECRET || 'd76c3974288973a601f5cd5d69eb273a')
     : (process.env.XUNHU_ALIPAY_APPSECRET || process.env.XUNHU_APPSECRET || '23e102d4ba120f878006356ae4f6d27c')
   const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
   const gateway = process.env.XUNHU_GATEWAY || 'https://api.xunhupay.com/payment/do.html'

   console.log("[雷达 2] 检查环境变量，Supabase Key 是否存在:", !!process.env.SUPABASE_SERVICE_ROLE_KEY)
   console.log("[雷达 2b] 当前 AppID:", appId)
   console.log("[雷达 2c] 当前支付网关:", gateway)

   if (!appSecret) {
     return NextResponse.json({ errcode: -1, error: '支付密钥未配置' }, { status: 500 })
   }

   if (!siteUrl) {
     return NextResponse.json({ errcode: -1, error: '系统配置缺失' }, { status: 500 })
   }

   let orderId: string
   try {
     console.log("[雷达 3] 准备写入数据库...")
     const inserted = await insertPendingOrder({
       title, totalFee, paymentMethod, shippingName, shippingPhone,
       shippingAddress, tshirtColor, generatedImageUrl, size,
     })
     orderId = inserted.orderId
     console.log("[雷达 4] 数据库写入成功，准备调用虎皮椒签名...")
   } catch (insertError) {
     console.error("❌ [致命错误] 数据库写入失败:", insertError)
     console.error('Database Error:', insertError)
     return NextResponse.json({ errcode: -11, errmsg: insertError instanceof Error ? insertError.message : String(insertError), error: '创建订单写库失败' }, { status: 500 })
   }

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

   const upstreamRes = await fetch(gateway, {
     method: 'POST',
     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
     body: new URLSearchParams(params).toString(),
   })

   const responseText = await upstreamRes.text()
   if (!upstreamRes.ok) {
     return NextResponse.json({ errcode: upstreamRes.status, error: '下单失败', errmsg: responseText, orderId }, { status: 502 })
   }

   let upstream = JSON.parse(responseText)
   const url = upstream?.url || upstream?.paymentUrl

   return NextResponse.json({ errcode: upstream.errcode || 0, url, paymentUrl: url, orderId })
 } catch (error) {
   console.error("❌ [致命错误]", error)
   return NextResponse.json({ errcode: -1, errmsg: error instanceof Error ? error.message : String(error), error: error instanceof Error ? error.message : String(error) }, { status: 500 })
 }
}
