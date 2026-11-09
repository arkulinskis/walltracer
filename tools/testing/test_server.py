"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure   (no -I: reads anvil.yaml)

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- stencils
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
JPG_THUMB = "data:image/jpeg;base64," + "A" * 400
as_user(None)
lib = call("list_stencils")
n_builtin = len(M["StencilArt"].STENCILS)
assert len(lib["stencils"]) == n_builtin and "Botanical" in lib["categories"], "built-in stencils are seeded on first visit"
assert all(st["thumb"].startswith("data:image/svg+xml;base64,") for st in lib["stencils"])
assert len(set(st["key"] for st in lib["stencils"])) == n_builtin, "stencil keys are unique"
call("list_stencils")
assert len(T.stencils.search()) == n_builtin, "seeding twice doesn't duplicate"
monstera = [st for st in lib["stencils"] if st["key"] == "monstera"][0]
full = ok(call("get_stencil", monstera["id"]))["stencil"]
assert full["image"].startswith("data:image/svg+xml;base64,")
bad(call("get_stencil", "nope"))
as_user(ana)
for fn, args in [("admin_stencils", ()), ("admin_add_stencil", ({},)), ("admin_update_stencil", (monstera["id"], {"published": False})),
                 ("admin_delete_stencil", (monstera["id"],))]:
    assert denied(fn, *args), fn
as_user(admin)
assert len(call("admin_stencils")["stencils"]) == n_builtin
bad(call("admin_add_stencil", {"title": "x"}), "title too short")
bad(call("admin_add_stencil", {"title": "Wave", "image": "data:text/html;base64,PGgxPg=="}), "only pictures")
bad(call("admin_add_stencil", {"title": "Sneaky svg", "image": "data:image/svg+xml;base64," + "PHN2Zz48L3N2Zz4" * 4}), "no SVG uploads")
custom = ok(call("admin_add_stencil", {"title": "Seagull", "category": "Animals", "level": "Easy", "cm": "45", "image": PNG, "thumb": PNG, "w": 1, "h": 1}))["stencil"]
assert custom["cm"] == 45 and not custom["builtin"] and custom["published"]
ok(call("admin_update_stencil", custom["id"], {"title": "Seagull flying", "category": "Weird", "cm": 9999}))
cu = T.stencils.get_by_id(custom["id"])
assert cu["title"] == "Seagull flying" and cu["category"] == "Other" and cu["cm"] == 1000
ok(call("admin_update_stencil", custom["id"], {"move": -1}))
assert cu["order"] == n_builtin - 1, "moved up one place"
ok(call("admin_update_stencil", monstera["id"], {"published": False}))
as_user(None)
assert monstera["id"] not in [st["id"] for st in call("list_stencils")["stencils"]], "hidden stencils leave the library"
bad(call("get_stencil", monstera["id"]), "hidden stencils can't be fetched by visitors")
as_user(admin)
ok(call("admin_update_stencil", monstera["id"], {"published": True}))
bad(call("admin_delete_stencil", monstera["id"]), "built-ins can't be deleted")
ok(call("admin_delete_stencil", custom["id"]))
assert T.stencils.get_by_id(custom["id"]) is None if hasattr(T.stencils, "get_by_id") else True

# ---------------------------------------------------------------------------------- projects
as_user(None)
assert denied("list_projects") and denied("create_project", {}) and denied("get_project", "x")
as_user(ana)
assert call("list_projects")["projects"] == []
pr = ok(call("create_project", {"stencil_id": monstera["id"]}))["project"]
assert pr["title"] == "Untitled wall" or pr["title"]
assert pr["settings"]["width_cm"] == monstera["cm"] and pr["settings"]["look"] == "lines", "a stencil opens at its suggested size"
assert pr["source"] == "stencil:monstera" and pr["thumb"].startswith("data:image/svg")
assert T.stencils.get_by_id(monstera["id"])["uses"] == 1, "stencil use is counted"
bad(call("create_project", {"stencil_id": "nope"}))
bad(call("create_project", {"title": "x", "image": "not a picture"}))
bad(call("create_project", {"title": "x", "image": PNG, "w": 0, "h": 5}), "size must be sane")
bad(call("create_project", "nonsense"))
up = ok(call("create_project", {"title": "  My   dog  ", "image": PNG, "thumb": JPG_THUMB, "w": 1200, "h": 800,
                                "settings": {"look": "outline", "color": "#FF00AA", "opacity": 7, "evil": 1, "rotate": 45}}))["project"]
assert up["title"] == "My dog" and up["settings"]["look"] == "outline" and up["settings"]["color"] == "#ff00aa"
assert up["settings"]["opacity"] == 1.0 and "evil" not in up["settings"] and up["settings"]["rotate"] == 0, "settings are cleaned"
assert up["thumb"] == JPG_THUMB
got = ok(call("get_project", up["id"]))["project"]
assert got["image"] == PNG, "the picture comes back as it went in"
as_user(bob)
bad(call("get_project", up["id"]), "someone else's project")
bad(call("update_project", up["id"], {"title": "Mine now"}))
bad(call("log_session", up["id"], 5))
ok(call("delete_project", up["id"]))
assert T.projects.get_by_id(up["id"]) is not None, "deleting someone else's project does nothing"
assert call("list_projects")["projects"] == []
as_user(ana)
r = ok(call("update_project", up["id"], {"title": "Dog mural", "settings": {"grid": True, "cols": 99, "width_cm": "150", "color": "red"}, "notes": "Sage 0.5 L"}))["project"]
assert r["title"] == "Dog mural" and r["settings"]["grid"] is True and r["settings"]["cols"] == 16 and r["settings"]["width_cm"] == 150
assert r["settings"]["color"] == "#ff00aa", "a bad colour keeps the old one"
assert r["settings"]["look"] == "outline", "settings merge with what was there"
bad(call("update_project", up["id"], {"status": "weird"}))
bad(call("update_project", up["id"], {"title": "   "}))
ok(call("update_project", up["id"], {"done": ["0,0", "1,0", "bad", "0,0", "99,1"]}))
assert T.projects.get_by_id(up["id"])["done"] == ["0,0", "1,0", "99,1"], "done cells are cleaned and de-duplicated"
r = ok(call("log_session", up["id"], 12.5, ["0,0"], True, {"width_cm": 160, "look": "zones"}))["project"]
assert r["minutes"] == 12.5 and r["sessions"] == 1 and r["done"] == ["0,0"] and r["settings"]["width_cm"] == 160 and r["settings"]["look"] == "zones"
r = ok(call("log_session", up["id"], 999))["project"]
assert r["minutes"] == 252.5 and r["sessions"] == 1, "one call adds at most 4 hours; not a new session"
bad(call("log_session", up["id"], "lots"))
dup = ok(call("duplicate_project", up["id"]))["project"]
assert dup["title"] == "Dog mural (copy)" and dup["minutes"] == 0 and dup["done"] == []
lst = call("list_projects")
assert lst["stats"]["count"] == 3 and lst["stats"]["minutes"] == 252
ok(call("update_project", pr["id"], {"status": "done"}))
assert call("list_projects")["stats"]["done"] == 1
ok(call("delete_project", dup["id"]))
assert len(call("list_projects")["projects"]) == 2

# ---------------------------------------------------------------------------------- showcase + demo data
as_user(None)
sc = call("list_showcase")
assert M["DemoData"].state() == "loaded" and sc["total"] == len(M["DemoData"].DEMO_POSTS), "demo walls load on first visit"
assert all("@" not in p["by"] for p in sc["posts"]), "never show emails"
top = call("list_showcase", "top")["posts"]
assert top[0]["likes"] >= top[-1]["likes"]
demo_post = sc["posts"][0]
assert ok(call("get_showcase_photo", demo_post["id"]))["photo"].startswith("data:image/svg+xml")
assert denied("like_showcase", demo_post["id"]) and denied("post_showcase", {})
as_user(ana)
liked = ok(call("like_showcase", demo_post["id"]))["post"]
assert liked["liked"] and liked["likes"] == demo_post["likes"] + 1
unliked = ok(call("like_showcase", demo_post["id"]))["post"]
assert not unliked["liked"] and unliked["likes"] == demo_post["likes"]
bad(call("post_showcase", {"title": "My wall"}), "a photo is needed")
bad(call("post_showcase", {"title": "x", "photo": PNG}), "a title is needed")
mine = ok(call("post_showcase", {"title": "Dog mural", "caption": "Two evenings", "photo": PNG, "thumb": JPG_THUMB, "minutes": "40", "width_cm": 150}))["post"]
assert mine["status"] == "pending" and mine["by"] == "Ana" and mine["minutes"] == 40
assert mine["id"] not in [p["id"] for p in call("list_showcase")["posts"]], "pending posts aren't public"
assert ok(call("get_showcase_photo", mine["id"]))["photo"] == PNG, "you can see your own pending post"
bad(call("like_showcase", mine["id"]), "can't like a pending post")
assert call("my_showcase")["posts"][0]["id"] == mine["id"]
as_user(bob)
bad(call("get_showcase_photo", mine["id"]), "others can't see pending posts")
bad(call("delete_showcase", mine["id"]))
assert denied("admin_showcase") and denied("admin_set_showcase", mine["id"], "approved")
as_user(admin)
queue = call("admin_showcase")
assert queue["counts"]["pending"] == 1 and queue["posts"][0]["email"] == "ana@example.com"
bad(call("admin_set_showcase", mine["id"], "maybe"))
ok(call("admin_set_showcase", mine["id"], "approved"))
assert mine["id"] in [p["id"] for p in call("list_showcase")["posts"]]
own = ok(call("post_showcase", {"title": "Admin wall", "photo": PNG}))["post"]
assert own["status"] == "approved", "admins' posts go straight up"
ok(call("delete_showcase", own["id"]), "admins can delete")
ov = call("admin_overview")
assert ov["projects"]["projects"] == 2 and ov["projects"]["minutes"] == 252 and ov["projects"]["finished"] == 1
assert ov["showcase_pending"] == 0 and ov["stencils"] == n_builtin
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and call("list_showcase")["total"] == 1, "removing demo data keeps real posts"
assert not T.users.search(is_demo=True)
as_user(None)
call("list_showcase")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert call("list_showcase")["total"] == 1 + len(M["DemoData"].DEMO_POSTS), "reloading replaces the demo instead of doubling it"
as_user(ana)
ok(call("delete_showcase", mine["id"]))
assert call("my_showcase")["posts"] == []

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "legal_state", "legal_accept", "list_stencils", "get_stencil", "list_showcase", "get_showcase_photo"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
