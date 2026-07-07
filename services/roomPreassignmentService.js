const fs = require("fs");
const path = require("path");

function createRoomPreassignmentService(options) {
  const {
    dataFile,
    displayDateToIso,
    hotelRoomNumbers,
    isoToDisplayDate,
    normalizeRoomType,
    readGroupReservations,
    readLatestRackStatus
  } = options;

  function ensureDataDirectory() {
    const dir =
      path.dirname(dataFile);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {
        recursive: true
      });
    }
  }

  function readRoomPreassignments() {
    try {
      if (!fs.existsSync(dataFile)) {
        return [];
      }

      const parsed =
        JSON.parse(
          fs.readFileSync(dataFile, "utf8")
        );

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch (error) {
      return [];
    }
  }

  function saveRoomPreassignments(assignments) {
    ensureDataDirectory();
    fs.writeFileSync(
      dataFile,
      JSON.stringify(assignments, null, 2)
    );
  }

  function getRoomCapacity(type) {
    const clean =
      String(type || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (
      clean.includes("suite")
      ||
      clean.includes("doble")
      ||
      clean.includes("matrimonial")
    ) {
      return 4;
    }

    if (clean.includes("king")) {
      return 2;
    }

    return 4;
  }

  function normalizePreassignment(input) {
    const date =
      String(input.date || "").trim();
    const room =
      String(input.room || "").replace(/\D/g, "");
    const sourceKey =
      String(input.sourceKey || "").trim();
    const guestName =
      String(input.guestName || "").trim();
    const adults =
      Math.max(Number(input.adults || 0), 0);
    const children =
      Math.max(Number(input.children || 0), 0);
    const people =
      Math.max(Number(input.people || adults + children || 1), 1);
    const roomType =
      normalizeRoomType(
        String(input.roomType || "").trim()
      );
    const status =
      String(input.status || "preasignado").trim() || "preasignado";
    const origin =
      String(input.origin || (sourceKey ? "Reserva" : "Sin reservacion")).trim();
    const note =
      String(input.note || "").trim();

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Fecha requerida");
    }

    if (!room || !hotelRoomNumbers.includes(room)) {
      throw new Error("Habitacion invalida");
    }

    if (!guestName) {
      throw new Error("Nombre del huesped requerido");
    }

    const rackRoom =
      readLatestRackStatus()?.rooms?.find(item =>
        item.room === room
      );
    const effectiveType =
      rackRoom?.type || roomType;
    const capacity =
      getRoomCapacity(effectiveType);

    if (people > capacity) {
      throw new Error(`Capacidad excedida: ${effectiveType || "habitacion"} permite ${capacity} persona(s)`);
    }

    return {
      id:
        String(input.id || `pre:${Date.now()}:${Math.random().toString(16).slice(2)}`),
      date,
      room,
      roomType:
        effectiveType || roomType,
      sourceKey,
      guestName,
      adults,
      children,
      people,
      origin,
      status,
      note,
      updatedAt:
        new Date().toISOString()
    };
  }

  function getPreassignmentReservationDates(assignment) {
    if (!assignment.sourceKey) {
      return [
        assignment.date
      ];
    }

    const reservation =
      readGroupReservations()
        .find(row =>
          row.sourceKey === assignment.sourceKey
        );
    const dates =
      Array.isArray(reservation?.dates)
        ? reservation.dates
        : [reservation?.fecha].filter(Boolean);
    const isoDates =
      dates
        .map(date =>
          String(date || "").includes("-")
            ? String(date).slice(0, 10)
            : displayDateToIso(date)
        )
        .filter(Boolean)
        .filter(date =>
          date >= assignment.date
        );

    return isoDates.length
      ? Array.from(new Set(isoDates))
      : [
        assignment.date
      ];
  }

  function buildExpandedPreassignments(assignment) {
    const dates =
      getPreassignmentReservationDates(assignment);
    const baseId =
      String(assignment.id || `pre:${Date.now()}:${Math.random().toString(16).slice(2)}`);

    return dates.map(date => ({
      ...assignment,
      id:
        dates.length > 1
          ? `${baseId}:${date}`
          : baseId,
      date
    }));
  }

  function saveRoomPreassignment(input) {
    const assignment =
      normalizePreassignment(input);
    const expandedAssignments =
      buildExpandedPreassignments(assignment);
    const assignments =
      readRoomPreassignments();
    const targetDates =
      new Set(
        expandedAssignments.map(item =>
          item.date
        )
      );
    const replaceExisting =
      item =>
        item.id === assignment.id
        ||
        (
          assignment.sourceKey
          &&
          item.sourceKey === assignment.sourceKey
          &&
          item.room === assignment.room
          &&
          targetDates.has(item.date)
        );
    const duplicateRoom =
      assignments.find(item =>
        targetDates.has(item.date)
        &&
        item.room === assignment.room
        &&
        !replaceExisting(item)
      );

    if (duplicateRoom) {
      throw new Error(`Esa habitacion ya esta preasignada para ${isoToDisplayDate(duplicateRoom.date) || duplicateRoom.date}`);
    }

    const next =
      assignments.filter(item =>
        !replaceExisting(item)
      );
    expandedAssignments.forEach(item =>
      next.push(item)
    );
    saveRoomPreassignments(next);

    return expandedAssignments[0];
  }

  function deleteRoomPreassignment(id) {
    const cleanId =
      String(id || "").trim();

    if (!cleanId) {
      throw new Error("Preasignacion requerida");
    }

    const assignments =
      readRoomPreassignments();
    const next =
      assignments.filter(item =>
        item.id !== cleanId
      );

    saveRoomPreassignments(next);
  }

  return {
    deleteRoomPreassignment,
    readRoomPreassignments,
    saveRoomPreassignment
  };
}

module.exports = {
  createRoomPreassignmentService
};
