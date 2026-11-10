package com.piyasa.widget.model

/** Sürükle-bırak sıralamaları. */
object Reorder {
    /** [from] konumundaki öğeyi [to] konumuna taşır. */
    fun <T> move(list: List<T>, from: Int, to: Int): List<T> {
        if (from !in list.indices || to !in list.indices || from == to) return list
        return list.toMutableList().apply { add(to, removeAt(from)) }
    }

    /**
     * [list] içindeki bir alt kümenin (ör. tek kategorinin göstergeleri) sırasını [order]'a göre değiştirir;
     * alt kümenin kapladığı konumlar ve diğer öğeler yerinde kalır. [order]'da olmayan anahtarlar yok sayılır.
     */
    fun <T, K> subset(list: List<T>, order: List<K>, key: (T) -> K): List<T> {
        val byKey = list.associateBy(key)
        val wanted = order.distinct().filter { it in byKey }
        val set = wanted.toHashSet()
        val queue = ArrayDeque(wanted.map { byKey.getValue(it) })
        return list.map { if (key(it) in set) queue.removeFirst() else it }
    }
}
