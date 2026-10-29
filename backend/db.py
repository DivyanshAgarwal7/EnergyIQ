"""
Database connection pool — single source of truth for all DB access.
Uses mysql-connector-python with a connection pool (not ORM).

Install: pip install mysql-connector-python flask flask-cors
"""

import mysql.connector
from mysql.connector import pooling, Error
from config import DB_CONFIG

# Increased pool size to 10 — sp_generate_forecasts calls multiple
# sub-queries per device and can hold several connections at once
_pool = pooling.MySQLConnectionPool(
    pool_name="energy_pool",
    pool_size=10,
    pool_reset_session=True,
    **DB_CONFIG
)


def get_connection():
    """Get a connection from the pool. Always use in a try/finally."""
    return _pool.get_connection()


def execute_query(sql: str, params: tuple = None) -> list[dict]:
    """
    Run a SELECT query, return list of dicts.
    Cursor and connection are always closed — even on error.
    """
    conn   = None
    cursor = None
    try:
        conn   = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        return cursor.fetchall()
    except Error as e:
        raise RuntimeError(f"Query failed: {e}") from e
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()   # returns connection to pool


def execute_write(sql: str, params: tuple = None) -> int:
    """
    Run INSERT / UPDATE / DELETE. Returns rows affected.
    """
    conn   = None
    cursor = None
    try:
        conn   = get_connection()
        cursor = conn.cursor()
        cursor.execute(sql, params or ())
        conn.commit()
        return cursor.rowcount
    except Error as e:
        if conn:
            try: conn.rollback()
            except: pass
        raise RuntimeError(f"Write failed: {e}") from e
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()


def call_procedure(proc_name: str, args: list = None) -> list[dict]:
    """
    Call a stored procedure, collect ALL result sets, return combined rows.
    Connection is always returned to the pool in finally.
    """
    conn   = None
    cursor = None
    try:
        conn   = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.callproc(proc_name, args or [])

        results = []
        for result_set in cursor.stored_results():
            results.extend(result_set.fetchall())

        conn.commit()
        return results
    except Error as e:
        if conn:
            try: conn.rollback()
            except: pass
        raise RuntimeError(f"Procedure {proc_name} failed: {e}") from e
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()