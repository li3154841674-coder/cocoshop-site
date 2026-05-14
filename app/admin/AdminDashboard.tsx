'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type AnyOrder = Record<string, any>

function fmtTime(value: any) {
  if (!value) return '-'
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value instanceof Date ? value : null
  if (!d || Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function getPaymentStatus(order: AnyOrder): 'paid' | 'pending' | 'unknown' {
  const v =
    (order.payment_status ?? order.pay_status ?? order.paid_status ?? order.paymentStatus ?? order.payStatus ?? order.status) as any

  if (typeof v === 'string') {
    const s = v.toLowerCase()
    if (['paid', 'od', 'success'].includes(s)) return 'paid'
    if (['pending', 'unpaid', 'wait', 'created'].includes(s)) return 'pending'
    if (s === 'shipped') return 'paid'
  }
  return 'unknown'
}

function getFulfillmentStatus(order: AnyOrder): string {
  const v = order.fulfillment_status ?? order.fulfillmentStatus ?? order.ship_status ?? order.shipStatus ?? order.status
  return typeof v === 'string' ? v : v ? String(v) : '-'
}

function getHdImageUrl(order: AnyOrder): string | null {
  const v =
    order.hd_image_url ??
    order.image_hd_url ??
    order.original_image_url ??
    order.image_url ??
    order.generated_image_url ??
    order.imageUrl
  return typeof v === 'string' && v.trim() ? v : null
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState<AnyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/orders', { cache: 'no-store' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `加载失败 (${res.status})`)
      }
      const data = await res.json()
      setOrders(Array.isArray(data?.orders) ? data.orders : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const paid = orders.filter((o) => getPaymentStatus(o) === 'paid').length
    const pending = orders.filter((o) => getPaymentStatus(o) === 'pending').length
    return { total: orders.length, paid, pending }
  }, [orders])

  const markShipped = useCallback(
    async (id: string) => {
      if (!id) return
      setUpdatingId(id)
      try {
        const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/ship`, { method: 'POST' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || `更新失败 (${res.status})`)
        }
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : '更新失败')
      } finally {
        setUpdatingId(null)
      }
    },
    [load]
  )

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-xs tracking-[0.25em] text-gray-400">ADMIN</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">订单</h1>
            <p className="mt-2 text-sm text-gray-500">
              总计 {stats.total} 单 · 已支付 {stats.paid} · 未支付 {stats.pending}
            </p>
          </div>

          <button
            onClick={load}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            刷新
          </button>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            {error}
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-3xl border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr className="border-b border-gray-200">
                  <th className="px-5 py-4 text-left font-medium">订单号 & 时间</th>
                  <th className="px-5 py-4 text-left font-medium">支付状态</th>
                  <th className="px-5 py-4 text-left font-medium">款式与尺码</th>
                  <th className="px-5 py-4 text-left font-medium">收件信息</th>
                  <th className="px-5 py-4 text-left font-medium">4K高清原图</th>
                  <th className="px-5 py-4 text-right font-medium">操作</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td className="px-5 py-10 text-gray-500" colSpan={6}>
                      加载中…
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td className="px-5 py-10 text-gray-500" colSpan={6}>
                      暂无订单（请确认 Supabase 的 `orders` 表已存在且有数据）
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const id = String(o.id ?? o.order_id ?? o.trade_order_id ?? '-')
                    const createdAt = o.created_at ?? o.createdAt ?? o.time ?? o.created
                    const pay = getPaymentStatus(o)
                    const style = o.style ?? o.product_style ?? o.tshirt_color ?? o.productName ?? o.title ?? '-'
                    const size = o.size ?? o.product_size ?? o.tshirt_size ?? o.pet_size ?? o.variant ?? '-'
                    const name = o.shipping_name ?? o.customer_name ?? o.name ?? o.receiver_name ?? o.shippingData?.name ?? '-'
                    const phone = o.shipping_phone ?? o.phone ?? o.receiver_phone ?? o.shippingData?.phone ?? '-'
                    const address = o.shipping_address ?? o.address ?? o.receiver_address ?? o.shippingData?.address ?? '-'
                    const hd = getHdImageUrl(o)
                    const fulfillment = getFulfillmentStatus(o)

                    const isShipped = typeof fulfillment === 'string' && fulfillment.toLowerCase() === 'shipped'
                    const canShip = pay === 'paid' && !isShipped

                    return (
                      <tr key={id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-5 align-top">
                          <div className="font-mono text-[12px] text-gray-900">{id}</div>
                          <div className="mt-1 text-xs text-gray-500">{fmtTime(createdAt)}</div>
                        </td>

                        <td className="px-5 py-5 align-top">
                          <span
                            className={[
                              'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                              pay === 'paid'
                                ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                                : pay === 'pending'
                                  ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                                  : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
                            ].join(' ')}
                          >
                           {String(pay).trim().toLowerCase() === 'paid' ? '已支付' : '未支付'}
                          </span>
                          <div className="mt-2 text-xs text-gray-500">当前状态: {fulfillment}</div>
                        </td>

                        <td className="px-5 py-5 align-top">
                          <div className="text-gray-900">{style}</div>
                          <div className="mt-1 text-xs text-gray-500">尺码: {size}</div>
                        </td>

                        <td className="px-5 py-5 align-top">
                          <div className="text-gray-900">{name}</div>
                          <div className="mt-1 text-xs text-gray-500">{phone}</div>
                          <div className="mt-2 text-xs text-gray-500 whitespace-pre-line">{address}</div>
                        </td>

                        <td className="px-5 py-5 align-top">
                          {hd ? (
                            <div className="flex items-center gap-3">
                              <a
                                href={hd}
                                target="_blank"
                                rel="noreferrer"
                                className="h-12 w-12 overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                                title="打开原图"
                              >
                                <img src={hd} alt="" className="h-full w-full object-cover" />
                              </a>
                              <a
                                className="rounded-2xl bg-gray-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-black transition-colors"
                                href={hd}
                                target="_blank"
                                rel="noreferrer"
                                download
                              >
                                📥 下载高清图
                              </a>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">无</div>
                          )}
                        </td>

                        <td className="px-5 py-5 align-top text-right">
                          <button
                            disabled={!canShip || updatingId === id}
                            onClick={() => markShipped(id)}
                            className={[
                              'rounded-2xl px-3.5 py-2 text-xs font-medium transition-colors',
                              canShip && updatingId !== id
                                ? 'bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 hover:border-gray-300'
                                : 'bg-gray-100 text-gray-400 border border-gray-100 cursor-not-allowed',
                            ].join(' ')}
                          >
                            {updatingId === id ? '更新中…' : isShipped ? '已发货' : '标记为已发货'}
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 text-xs text-gray-400 leading-relaxed">
          提示：后台接口使用 HttpOnly Cookie 校验，不会在前端暴露密钥。订单数据来自 Supabase `orders` 表，默认最多拉取 200 条。
        </div>
      </div>
    </div>
  )
}

