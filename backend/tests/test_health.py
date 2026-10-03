from sqlalchemy import text


def test_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_db_session_works(db):
    assert db.execute(text("SELECT 1")).scalar_one() == 1
