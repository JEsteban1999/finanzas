def _names(client, **params):
    return {(c["name"], c["kind"]) for c in client.get("/api/categories", params=params).json()}


def test_new_user_gets_default_categories(client_a):
    names = _names(client_a)
    assert ("Salario", "income") in names
    assert ("Comida", "expense") in names
    assert len(names) == 10


def test_create_category(client_a):
    response = client_a.post("/api/categories", json={"name": "  Mascotas ", "kind": "expense"})
    assert response.status_code == 201
    assert response.json()["name"] == "Mascotas"
    assert response.json()["archived"] is False


def test_duplicate_name_same_kind_is_conflict_case_insensitive(client_a):
    response = client_a.post("/api/categories", json={"name": "comida", "kind": "expense"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CATEGORY_NAME_TAKEN"


def test_same_name_other_kind_is_allowed(client_a):
    response = client_a.post("/api/categories", json={"name": "Otros", "kind": "income"})
    assert response.status_code == 201


def test_rename_and_archive(client_a):
    cat = client_a.post("/api/categories", json={"name": "Viajes", "kind": "expense"}).json()
    renamed = client_a.patch(f"/api/categories/{cat['id']}", json={"name": "Vacaciones"})
    assert renamed.status_code == 200 and renamed.json()["name"] == "Vacaciones"
    archived = client_a.patch(f"/api/categories/{cat['id']}", json={"archived": True})
    assert archived.json()["archived"] is True
    assert ("Vacaciones", "expense") not in _names(client_a)
    assert ("Vacaciones", "expense") in _names(client_a, include_archived="true")
    restored = client_a.patch(f"/api/categories/{cat['id']}", json={"archived": False})
    assert restored.json()["archived"] is False


def test_rename_to_existing_name_conflicts(client_a):
    cat = client_a.post("/api/categories", json={"name": "Viajes", "kind": "expense"}).json()
    response = client_a.patch(f"/api/categories/{cat['id']}", json={"name": "Comida"})
    assert response.status_code == 409


def test_delete_unused_category(client_a):
    cat = client_a.post("/api/categories", json={"name": "Viajes", "kind": "expense"}).json()
    assert client_a.delete(f"/api/categories/{cat['id']}").status_code == 204
    assert ("Viajes", "expense") not in _names(client_a, include_archived="true")


def test_other_user_cannot_touch_category(client_a, client_b):
    cat = client_a.post("/api/categories", json={"name": "Viajes", "kind": "expense"}).json()
    assert client_b.patch(f"/api/categories/{cat['id']}", json={"name": "X"}).status_code == 404
    response = client_b.delete(f"/api/categories/{cat['id']}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "CATEGORY_NOT_FOUND"
    assert ("Viajes", "expense") not in _names(client_b)


def test_categories_require_auth(client):
    assert client.get("/api/categories").status_code == 401
